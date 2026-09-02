"""Economy dashboard — the shared "money" side of the staff panel.

Income is DERIVED from confirmed bookings (per-slot service prices, attributed
to the slot's own stylist); expenses are manual entries here; budget targets
are monthly per-category goals. Every endpoint is staff-only (owner + both
stylists see the same salon-wide numbers)."""
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response
import models, schemas
from auth import get_current_admin

router = APIRouter(prefix="/economy", tags=["Economy"])

# Fixed expense categories keep the budget view stable across months.
EXPENSE_CATEGORIES = [
    "rent", "products", "salaries", "utilities", "marketing", "maintenance", "other",
]

_IST = timezone(timedelta(hours=5, minutes=30))


def _ist_today() -> str:
    return datetime.now(_IST).date().isoformat()


def _validate_range(from_date: Optional[str], to_date: Optional[str]):
    """Defaults: last 30 days inclusive. Returns (from, to) as YYYY-MM-DD."""
    today = _ist_today()
    try:
        f = datetime.strptime(from_date, "%Y-%m-%d").date().isoformat() if from_date \
            else (datetime.now(_IST).date() - timedelta(days=29)).isoformat()
        t = datetime.strptime(to_date, "%Y-%m-%d").date().isoformat() if to_date else today
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")
    if f > t:
        raise HTTPException(status_code=400, detail="from date is after to date.")
    return f, t


def _validate_month(month: Optional[str]) -> str:
    if not month:
        return _ist_today()[:7]
    try:
        return datetime.strptime(month, "%Y-%m").date().isoformat()[:7]
    except ValueError:
        raise HTTPException(status_code=400, detail="Month must be YYYY-MM")


async def _income_rows(from_date: str, to_date: str):
    """Confirmed bookings in the range with per-slot (service, stylist, price)
    resolution. Returns (bookings, slot_rows) where slot_rows carries the
    resolved price/category/stylist-name per row."""
    bookings = await models.Booking.find(
        models.Booking.date >= from_date,
        models.Booking.date <= to_date,
        models.Booking.status == models.BookingStatus.confirmed,
    ).sort(models.Booking.date).to_list()

    services = {s.id: s for s in await models.Service.find_all().to_list()}
    stylists = {s.id: s for s in await models.Stylist.find_all().to_list()}
    slot_rows = []
    for b in bookings:
        slots = await models.BookingSlot.find(
            models.BookingSlot.booking_id == b.id
        ).sort(models.BookingSlot.sequence).to_list()
        for s in slots:
            svc = services.get(s.service_id)
            sty = stylists.get(s.stylist_id)
            slot_rows.append({
                "booking": b,
                "slot": s,
                "price": (svc.price if svc else 0) or 0,
                "category": (svc.category if svc else "general") or "general",
                "stylist_name": (sty.name if sty else "Unknown"),
            })
    return bookings, slot_rows


@router.get("/summary", response_model=schemas.EconomySummary)
async def economy_summary(
    from_date: str = Query(None, alias="from"),
    to_date: str = Query(None, alias="to"),
    _admin: models.User = Depends(get_current_admin),
):
    f, t = _validate_range(from_date, to_date)

    bookings, slot_rows = await _income_rows(f, t)
    income = sum(r["price"] for r in slot_rows)
    income_by_category, income_by_stylist = {}, {}
    for r in slot_rows:
        income_by_category[r["category"]] = income_by_category.get(r["category"], 0) + r["price"]
        income_by_stylist[r["stylist_name"]] = income_by_stylist.get(r["stylist_name"], 0) + r["price"]

    expenses_rows = await models.Expense.find(
        models.Expense.date >= f,
        models.Expense.date <= t,
    ).to_list()
    expenses = sum(e.amount for e in expenses_rows)
    expenses_by_category = {}
    for e in expenses_rows:
        expenses_by_category[e.category] = expenses_by_category.get(e.category, 0) + e.amount

    # Counts across ALL statuses in the window (the funnel view).
    all_bookings = await models.Booking.find(
        models.Booking.date >= f,
        models.Booking.date <= t,
    ).to_list()

    def _status(b):
        return b.status if isinstance(b.status, str) else b.status.value

    daily = {}
    for b in all_bookings:
        if _status(b) == "confirmed":
            daily.setdefault(b.date, {"income": 0.0, "expense": 0.0})["income"] += sum(
                r["price"] for r in slot_rows if r["booking"].id == b.id)
    for e in expenses_rows:
        daily.setdefault(e.date, {"income": 0.0, "expense": 0.0})["expense"] += e.amount

    return schemas.EconomySummary(
        from_date=f,
        to_date=t,
        income=round(income, 2),
        expenses=round(expenses, 2),
        net=round(income - expenses, 2),
        bookings_total=len(all_bookings),
        bookings_confirmed=sum(1 for b in all_bookings if _status(b) == "confirmed"),
        bookings_cancelled=sum(1 for b in all_bookings if _status(b) == "cancelled"),
        bookings_declined=sum(1 for b in all_bookings if _status(b) == "declined"),
        walk_ins=sum(1 for b in all_bookings if (b.source or "online") == "walk_in"),
        online=sum(1 for b in all_bookings if (b.source or "online") == "online"),
        income_by_category={k: round(v, 2) for k, v in sorted(income_by_category.items())},
        income_by_stylist={k: round(v, 2) for k, v in sorted(income_by_stylist.items())},
        expenses_by_category={k: round(v, 2) for k, v in sorted(expenses_by_category.items())},
        daily=[{"date": d, **daily[d]} for d in sorted(daily)],
    )


# ── Expenses ──────────────────────────────────────────────────────────────────
@router.get("/expenses", response_model=List[schemas.ExpenseOut])
async def list_expenses(
    from_date: str = Query(None, alias="from"),
    to_date: str = Query(None, alias="to"),
    _admin: models.User = Depends(get_current_admin),
):
    f, t = _validate_range(from_date, to_date)
    return await models.Expense.find(
        models.Expense.date >= f,
        models.Expense.date <= t,
    ).sort(-models.Expense.date).to_list()


@router.post("/expenses", response_model=schemas.ExpenseOut, status_code=201)
async def add_expense(
    body: schemas.ExpenseCreate,
    admin: models.User = Depends(get_current_admin),
):
    try:
        datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    if body.category not in EXPENSE_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Category must be one of: {', '.join(EXPENSE_CATEGORIES)}",
        )
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive.")
    expense = models.Expense(
        date=body.date,
        category=body.category,
        description=(body.description or "").strip() or None,
        amount=round(body.amount, 2),
        created_by=admin.id,
    )
    await expense.insert()
    return expense


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: PydanticObjectId,
    _admin: models.User = Depends(get_current_admin),
):
    expense = await models.Expense.get(expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    await expense.delete()


# ── Budget targets ────────────────────────────────────────────────────────────
@router.get("/budgets", response_model=schemas.BudgetResponse)
async def get_budgets(
    month: str = Query(None, description="YYYY-MM, defaults to current month"),
    _admin: models.User = Depends(get_current_admin),
):
    m = _validate_month(month)
    targets = {t.category: t.amount for t in await models.BudgetTarget.find(
        models.BudgetTarget.month == m).to_list()}
    spent = {}
    async for e in models.Expense.find(
        models.Expense.date >= f"{m}-01",
        models.Expense.date <= f"{m}-31",
    ):
        spent[e.category] = spent.get(e.category, 0) + e.amount
    return schemas.BudgetResponse(
        month=m,
        categories=[
            schemas.BudgetCategoryStatus(
                category=c,
                target=round(targets.get(c, 0), 2),
                spent=round(spent.get(c, 0), 2),
            ) for c in EXPENSE_CATEGORIES
        ],
    )


@router.put("/budgets", response_model=schemas.BudgetResponse)
async def set_budget(
    body: schemas.BudgetTargetIn,
    month: str = Query(None, description="YYYY-MM, defaults to current month"),
    _admin: models.User = Depends(get_current_admin),
):
    m = _validate_month(month)
    if body.category not in EXPENSE_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Category must be one of: {', '.join(EXPENSE_CATEGORIES)}",
        )
    existing = await models.BudgetTarget.find_one(
        models.BudgetTarget.month == m,
        models.BudgetTarget.category == body.category,
    )
    if body.amount <= 0:
        # 0 clears the target — the UI treats it as "no goal".
        if existing:
            await existing.delete()
    elif existing:
        existing.amount = round(body.amount, 2)
        await existing.save()
    else:
        await models.BudgetTarget(month=m, category=body.category,
                                  amount=round(body.amount, 2)).insert()
    return await get_budgets(month=m, _admin=_admin)


# ── CSV export ────────────────────────────────────────────────────────────────
def _csv_response(filename: str, header: List[str], rows: List[List]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    # BOM so Excel opens the file as UTF-8 (customer names can be non-ASCII).
    content = "\ufeff" + buf.getvalue()
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export")
async def export_csv(
    type: str = Query(..., description="bookings | income | expenses"),
    from_date: str = Query(None, alias="from"),
    to_date: str = Query(None, alias="to"),
    _admin: models.User = Depends(get_current_admin),
):
    f, t = _validate_range(from_date, to_date)

    if type == "expenses":
        rows = await models.Expense.find(
            models.Expense.date >= f, models.Expense.date <= t
        ).sort(models.Expense.date).to_list()
        return _csv_response(
            f"ayra-expenses-{f}-to-{t}.csv",
            ["Date", "Category", "Description", "Amount"],
            [[r.date, r.category, r.description or "", r.amount] for r in rows],
        )

    bookings = await models.Booking.find(
        models.Booking.date >= f, models.Booking.date <= t
    ).sort(models.Booking.date).to_list()

    if type == "bookings":
        out = []
        for b in bookings:
            user = await models.User.get(b.user_id)
            slots = await models.BookingSlot.find(
                models.BookingSlot.booking_id == b.id
            ).sort(models.BookingSlot.sequence).to_list()
            names, sty_names = [], []
            for s in slots:
                svc = await models.Service.get(s.service_id)
                sty = await models.Stylist.get(s.stylist_id)
                if svc:
                    names.append(svc.name)
                if sty and sty.name not in sty_names:
                    sty_names.append(sty.name)
            status = b.status if isinstance(b.status, str) else b.status.value
            out.append([
                b.date, b.time_slot or "", user.name if user else "",
                user.phone if user else "", " + ".join(names),
                " + ".join(sty_names), status, b.source or "online",
            ])
        return _csv_response(
            f"ayra-bookings-{f}-to-{t}.csv",
            ["Date", "Time", "Customer", "Phone", "Services", "Stylist(s)", "Status", "Source"],
            out,
        )

    if type == "income":
        _, slot_rows = await _income_rows(f, t)
        out = []
        for r in slot_rows:
            b, s = r["booking"], r["slot"]
            user = await models.User.get(b.user_id)
            out.append([
                s.date, s.time_slot, user.name if user else "",
                r["stylist_name"], r["category"], r["price"],
            ])
        return _csv_response(
            f"ayra-income-{f}-to-{t}.csv",
            ["Date", "Time", "Customer", "Stylist", "Service Category", "Amount"],
            out,
        )

    raise HTTPException(status_code=400, detail="type must be bookings, income or expenses")
