# ==========================================
# 图片上传模块
# 支持多种图床服务
# ==========================================

import requests
import base64
import json

class ImageUploader:
    """图片上传器 - 支持多种图床"""
    
    def __init__(self, service='imgbb'):
        """
        初始化上传器
        
        Args:
            service: 图床服务名称 ('imgbb', 'imgur', 'sm.ms')
        """
        self.service = service
        self.api_keys = {
            # ImgBB API Key (免费，需要注册：https://api.imgbb.com/)
            'imgbb': '7088c73ab85fbb7bb94cd70f1c747eef',  # ✅ 已配置
            
            # Imgur Client ID (免费，需要注册：https://api.imgur.com/oauth2/addclient)
            'imgur': '在这里填入你的Imgur_Client_ID',  # ⚠️ 替换为你的 Client ID
        }
        
        # ✅ 禁用代理，直连图床（避免代理连接问题）
        self.proxies = {
            'http': None,
            'https': None
        }
    
    def upload(self, file_path_or_bytes, filename='image.png'):
        """
        上传图片
        
        Args:
            file_path_or_bytes: 文件路径或字节数据
            filename: 文件名
            
        Returns:
            dict: {"success": True, "url": "..."} 或 {"success": False, "error": "..."}
        """
        if self.service == 'imgbb':
            return self._upload_to_imgbb(file_path_or_bytes, filename)
        elif self.service == 'imgur':
            return self._upload_to_imgur(file_path_or_bytes, filename)
        elif self.service == 'sm.ms':
            return self._upload_to_smms(file_path_or_bytes, filename)
        else:
            return {"success": False, "error": f"不支持的图床服务: {self.service}"}
    
    def _upload_to_imgbb(self, file_data, filename):
        """上传到 ImgBB"""
        api_key = self.api_keys.get('imgbb')
        if not api_key or api_key == '你的ImgBB_API_KEY':
            return {"success": False, "error": "请配置 ImgBB API Key"}
        
        try:
            # 读取文件数据
            if isinstance(file_data, str):
                with open(file_data, 'rb') as f:
                    file_bytes = f.read()
            else:
                file_bytes = file_data
            
            # Base64 编码
            b64_image = base64.b64encode(file_bytes).decode('utf-8')
            
            # 上传
            url = 'https://api.imgbb.com/1/upload'
            payload = {
                'key': api_key,
                'image': b64_image,
                'name': filename
            }
            
            # 增加超时时间，大图片需要更长时间上传
            # timeout=(连接超时, 读取超时)
            timeout = (10, 60)  # 连接10秒，读取60秒
            print(f"[ImgBB] 上传中... (超时设置: {timeout})")
            response = requests.post(url, data=payload, timeout=timeout, proxies=self.proxies)
            result = response.json()
            
            if result.get('success'):
                return {
                    "success": True,
                    "url": result['data']['url'],
                    "delete_url": result['data']['delete_url']
                }
            else:
                return {
                    "success": False,
                    "error": result.get('error', {}).get('message', '上传失败')
                }
                
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def _upload_to_imgur(self, file_data, filename):
        """上传到 Imgur"""
        client_id = self.api_keys.get('imgur')
        if not client_id or client_id == '你的Imgur_Client_ID':
            return {"success": False, "error": "请配置 Imgur Client ID"}
        
        try:
            # 读取文件数据
            if isinstance(file_data, str):
                with open(file_data, 'rb') as f:
                    file_bytes = f.read()
            else:
                file_bytes = file_data
            
            # Base64 编码
            b64_image = base64.b64encode(file_bytes).decode('utf-8')
            
            # 上传
            url = 'https://api.imgur.com/3/image'
            headers = {'Authorization': f'Client-ID {client_id}'}
            data = {
                'image': b64_image,
                'type': 'base64',
                'name': filename
            }
            
            response = requests.post(url, headers=headers, data=data, timeout=30, proxies=self.proxies)
            result = response.json()
            
            if result.get('success'):
                return {
                    "success": True,
                    "url": result['data']['link']
                }
            else:
                return {
                    "success": False,
                    "error": result.get('data', {}).get('error', '上传失败')
                }
                
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def _upload_to_smms(self, file_data, filename):
        """上传到 SM.MS (无需 API Key，但有限制)"""
        try:
            print(f"[SM.MS] 开始上传: {filename}")
            
            # 读取文件数据
            if isinstance(file_data, str):
                with open(file_data, 'rb') as f:
                    file_bytes = f.read()
            else:
                file_bytes = file_data
            
            print(f"[SM.MS] 文件大小: {len(file_bytes)} bytes")
            
            # 上传
            url = 'https://sm.ms/api/v2/upload'
            files = {'smfile': (filename, file_bytes)}
            
            print(f"[SM.MS] 发送请求到 {url}")
            response = requests.post(url, files=files, timeout=30, proxies=self.proxies)
            print(f"[SM.MS] HTTP状态码: {response.status_code}")
            
            result = response.json()
            print(f"[SM.MS] 返回结果: {result}")
            
            if result.get('success'):
                print(f"[SM.MS] ✅ 上传成功: {result['data']['url']}")
                return {
                    "success": True,
                    "url": result['data']['url'],
                    "delete_url": result['data'].get('delete')
                }
            else:
                error_msg = result.get('message', '上传失败')
                print(f"[SM.MS] ❌ 上传失败: {error_msg}")
                return {
                    "success": False,
                    "error": error_msg
                }
                
        except Exception as e:
            error_msg = str(e)
            print(f"[SM.MS] ❌ 异常: {error_msg}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": error_msg}

# ==========================================
# 测试代码
# ==========================================
if __name__ == '__main__':
    uploader = ImageUploader('sm.ms')  # 使用 SM.MS (无需配置)
    
    # 测试上传
    result = uploader.upload('test_image.png')
    print(result)

