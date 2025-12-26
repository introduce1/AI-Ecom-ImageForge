# ==========================================
# 本地图片存储（用于测试，无需图床）
# ==========================================

import os
import uuid
from werkzeug.utils import secure_filename

class LocalImageStorage:
    """本地图片存储器"""
    
    def __init__(self, upload_folder='static/uploads', base_url='http://localhost:5000'):
        self.upload_folder = upload_folder
        self.base_url = base_url
        
        # 创建上传目录
        os.makedirs(upload_folder, exist_ok=True)
    
    def save_image(self, file_bytes, filename):
        """
        保存图片到本地
        
        Args:
            file_bytes: 文件字节数据
            filename: 原始文件名
            
        Returns:
            dict: {"success": True, "url": "..."} 或 {"success": False, "error": "..."}
        """
        try:
            # 生成唯一文件名
            ext = os.path.splitext(filename)[1]
            unique_filename = f"{uuid.uuid4().hex}{ext}"
            
            # 保存文件
            file_path = os.path.join(self.upload_folder, unique_filename)
            with open(file_path, 'wb') as f:
                f.write(file_bytes)
            
            # 生成访问 URL
            url = f"{self.base_url}/uploads/{unique_filename}"
            
            print(f"[本地存储] ✅ 保存成功: {url}")
            return {"success": True, "url": url}
            
        except Exception as e:
            print(f"[本地存储] ❌ 保存失败: {e}")
            return {"success": False, "error": str(e)}

