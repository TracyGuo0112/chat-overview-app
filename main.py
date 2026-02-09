from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

# 1. 模拟数据库
fake_db = []

# 2. Pydantic 模型定义

class TaskCreate(BaseModel):
    content: str

class TaskUpdate(BaseModel):
    # 这里的 Optional 表示这些字段可以不传，默认是 None
    content: Optional[str] = None
    is_completed: Optional[bool] = None

class TaskResponse(BaseModel):
    id: int
    content: str
    is_completed: bool

# 3. API 接口

@app.post("/tasks", response_model=TaskResponse)
def create_task(task: TaskCreate):
    new_id = 1
    if len(fake_db) > 0:
        new_id = fake_db[-1]["id"] + 1
    
    new_task = {
        "id": new_id,
        "content": task.content,
        "is_completed": False
    }
    fake_db.append(new_task)
    return new_task

@app.get("/tasks", response_model=List[TaskResponse])
def read_tasks():
    return fake_db

# 新增：PATCH 接口用于局部更新
@app.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, task_update: TaskUpdate):
    # 第一步：先找到那个任务
    # (这里用了一个简单的循环查找，真实数据库会有更高效的方法)
    found_task = None
    for task in fake_db:
        if task["id"] == task_id:
            found_task = task
            break
            
    # 如果找不到，报错 404
    if not found_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # 第二步：只更新用户传进来的字段
    if task_update.content is not None:
        found_task["content"] = task_update.content
    
    if task_update.is_completed is not None:
        found_task["is_completed"] = task_update.is_completed
        
    return found_task

# 运行命令: uvicorn main:app --reload