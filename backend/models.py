from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid # 추가

class User(BaseModel):
    id: Optional[str] = None
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Flipbook(BaseModel):
    uuid_key: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    user_id: str = "admin"
    page_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # Firestore는 리스트(배열)를 직접 지원하므로 변경
    image_urls: List[str] = [] 

class Overlay(BaseModel):
    id: Optional[str] = None
    flipbook_id: str
    page: int
    type: str  # 'link', 'video'
    x: float
    y: float
    width: float
    height: float
    data_url: str # YouTube URL 또는 리다이렉트 링크
