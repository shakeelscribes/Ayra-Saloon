from fastapi import APIRouter, Depends, HTTPException, status
import models, schemas
from auth import get_password_hash, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/register", response_model=schemas.TokenResponse, status_code=201)
async def register(user_data: schemas.UserRegister):
    existing = await models.User.find_one(models.User.email == user_data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        name=user_data.name,
        email=user_data.email,
        phone=user_data.phone,
        hashed_password=get_password_hash(user_data.password),
        is_admin=False,
    )
    await user.insert()

    token = create_access_token({"sub": user.email})
    return schemas.TokenResponse(
        access_token=token,
        token_type="bearer",
        user=schemas.UserOut.model_validate(user),
    )

@router.post("/login", response_model=schemas.TokenResponse)
async def login(credentials: schemas.UserLogin):
    user = await models.User.find_one(models.User.email == credentials.email)
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token({"sub": user.email})
    return schemas.TokenResponse(
        access_token=token,
        token_type="bearer",
        user=schemas.UserOut.model_validate(user),
    )
