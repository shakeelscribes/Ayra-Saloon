from fastapi import APIRouter, HTTPException
import models, schemas
from typing import List
from beanie import PydanticObjectId

router = APIRouter(prefix="/stylists", tags=["Stylists"])

@router.get("/", response_model=List[schemas.StylistOut])
async def get_stylists():
    return await models.Stylist.find_all().to_list()

@router.get("/{stylist_id}", response_model=schemas.StylistOut)
async def get_stylist(stylist_id: PydanticObjectId):
    stylist = await models.Stylist.get(stylist_id)
    if not stylist:
        raise HTTPException(status_code=404, detail="Stylist not found")
    return stylist
