from fastapi import APIRouter, HTTPException
import models, schemas
from typing import List
from beanie import PydanticObjectId

router = APIRouter(prefix="/services", tags=["Services"])

@router.get("/", response_model=List[schemas.ServiceOut])
async def get_services():
    return await models.Service.find_all().to_list()

@router.get("/{service_id}", response_model=schemas.ServiceOut)
async def get_service(service_id: PydanticObjectId):
    service = await models.Service.get(service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return service
