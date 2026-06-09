"""
Jiekou.ai API 客户端
支持多种图像生成模型
"""

import requests
from requests.adapters import HTTPAdapter
import time
import base64
from typing import Dict, Any, Optional, List
from .config import JIEKOU_API_KEY


class JiekouAPIError(Exception):
    """Jiekou API 异常"""
    pass


class JiekouBaseClient:
    """Jiekou API 基础客户端"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or JIEKOU_API_KEY
        if not self.api_key:
            raise ValueError("未配置 Jiekou API Key，请在 models/config.py 中配置")
        
        self.base_url = "https://api.jiekou.ai"
        self.timeout = (15, 180)  # 连接超时15s，读取超时180s（优化：减少等待时间）
        self.session = requests.Session()
        self.session.trust_env = False  # 禁用系统代理，避免额外握手开销
        adapter = HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=0)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """发送 HTTP 请求"""
        url = f"{self.base_url}{endpoint}"
        
        # 确保请求头正确设置（不会被 kwargs 覆盖）
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # 如果 kwargs 中有 headers，合并它们（但确保 Authorization 和 Content-Type 不被覆盖）
        if 'headers' in kwargs:
            headers.update(kwargs.pop('headers'))
            # 确保关键头部不被覆盖
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["Content-Type"] = "application/json"
        
        # 调试：打印请求头（隐藏完整 API Key）
        print(f"[Jiekou API] 请求 URL: {url}")
        print(f"[Jiekou API] 请求头 Authorization: Bearer {self.api_key[:10]}...{self.api_key[-4:] if len(self.api_key) > 14 else '***'}")
        print(f"[Jiekou API] 请求头 Content-Type: {headers.get('Content-Type')}")
        
        try:
            if method.upper() == "POST":
                response = self.session.post(url, headers=headers, timeout=self.timeout, **kwargs)
            elif method.upper() == "GET":
                response = self.session.get(url, headers=headers, timeout=self.timeout, **kwargs)
            else:
                raise ValueError(f"不支持的请求方法: {method}")
            
            # 如果状态码不是 2xx，先打印详细错误信息
            if not response.ok:
                error_detail = f"状态码: {response.status_code}"
                try:
                    error_json = response.json()
                    print(f"[Jiekou API] ❌ 错误响应: {error_json}")
                    error_detail = f"{error_detail}, 响应: {error_json}"
                except:
                    print(f"[Jiekou API] ❌ 错误响应文本: {response.text[:500]}")
                    error_detail = f"{error_detail}, 响应: {response.text[:200]}"
                
                raise JiekouAPIError(f"API 请求失败 ({response.status_code}): {error_detail}")
            
            response.raise_for_status()
            return response.json()
        
        except requests.exceptions.Timeout:
            raise JiekouAPIError("API 请求超时")
        except JiekouAPIError:
            raise  # 重新抛出我们自己的异常
        except requests.exceptions.RequestException as e:
            raise JiekouAPIError(f"API 请求失败: {str(e)}")
    
    def _poll_task_result(self, task_id: str, max_wait: int = 180, poll_interval: int = 1) -> Dict[str, Any]:
        """轮询任务结果（用于异步 API）"""
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            try:
                result = self._make_request("GET", f"/v3/async/task-result?task_id={task_id}")
                
                # 任务完成
                if result.get("status") == "completed":
                    return result
                
                # 任务失败
                elif result.get("status") == "failed":
                    error_msg = result.get("error", "未知错误")
                    raise JiekouAPIError(f"任务失败: {error_msg}")
                
                # 任务进行中，继续轮询
                print(f"[Jiekou] 任务进行中... ({int(time.time() - start_time)}s)")
                time.sleep(poll_interval)
            
            except JiekouAPIError:
                raise
            except Exception as e:
                print(f"[Jiekou] 轮询出错: {e}")
                time.sleep(poll_interval)
        
        raise JiekouAPIError(f"任务超时（超过 {max_wait} 秒）")
    
    def _extract_image_url(self, result: Dict[str, Any]) -> str:
        """从API响应中提取图片URL"""
        # 优先处理 image_urls 数组（Gemini 3 Pro Image 格式）
        if "image_urls" in result and isinstance(result["image_urls"], list) and len(result["image_urls"]) > 0:
            return result["image_urls"][0]
        
        # GPT Image API 响应格式：data 数组
        if "data" in result:
            data = result["data"]
            if isinstance(data, list) and len(data) > 0:
                # GPT Image API 响应格式：data[0] 包含 url 或 b64_json
                if "b64_json" in data[0]:
                    # Base64 格式
                    return f"data:image/png;base64,{data[0]['b64_json']}"
                elif "url" in data[0]:
                    return data[0]["url"]
                # 兼容其他可能的字段名
                elif "image_url" in data[0]:
                    return data[0]["image_url"]
        
        # 直接包含 url 字段
        if "url" in result:
            return result["url"]
        
        raise JiekouAPIError("无法从响应中提取图片URL")


# ==========================================
# FLUX.1 Kontext Dev - 文生图 & 图生图
# ==========================================
class FluxKontextDevProvider(JiekouBaseClient):
    """
    FLUX.1 Kontext Dev 模型
    类型：文生图 + 图生图
    特点：高质量提示词生成和图像编辑
    """
    
    def generate(
        self,
        prompt: str,
        image_base64s: Optional[List[str]] = None,
        fast_mode: bool = False,
        size: str = "1024*1024",
        num_inference_steps: int = 28,
        guidance_scale: float = 2.5,
        num_images: int = 1,
        seed: int = -1,
        output_format: str = "jpeg",
        **kwargs
    ) -> Dict[str, Any]:
        """
        生成图片
        
        Args:
            prompt: 提示词（必填）
            image_base64s: 参考图片列表（可选，用于图生图，最多4张）
            fast_mode: 极速模式（默认False）
            size: 图片尺寸，格式：宽*高，例如：1024*1024（每个维度范围256~1536）
            num_inference_steps: 推理步数（默认28，范围1~50）
            guidance_scale: 引导系数（默认2.5，范围1.0~20.0）
            num_images: 生成图像数量（默认1，范围1~4）
            seed: 随机种子（默认-1，-1表示随机）
            output_format: 输出格式（默认jpeg，可选jpeg/png/webp）
        """
        try:
            # 修正size格式：如果用户输入的是"1024x1024"，转换为"1024*1024"
            if size and "x" in size and "*" not in size:
                size = size.replace("x", "*")
            
            payload = {
                "prompt": prompt,
                "fast_mode": fast_mode,
                "size": size,
                "num_inference_steps": num_inference_steps,
                "guidance_scale": guidance_scale,
                "num_images": num_images,
                "seed": seed,
                "output_format": output_format
            }
            
            # 图生图模式：添加images参数（最多4张）
            if image_base64s and len(image_base64s) > 0:
                payload["images"] = image_base64s[:4]  # 最多4张
            
            print(f"[Jiekou FLUX Kontext] {'图生图' if image_base64s else '文生图'} 模式")
            
            # 调用异步API
            response = self._make_request("POST", "/v3/async/flux-1-kontext-dev", json=payload)
            task_id = response.get("task_id")
            
            if not task_id:
                raise JiekouAPIError("未返回 task_id")
            
            print(f"[Jiekou FLUX Kontext] 任务ID: {task_id}")
            
            # 轮询结果
            result = self._poll_task_result(task_id)
            image_url = self._extract_image_url(result)
            
            return {
                "success": True,
                "image_url": image_url,
                "task_id": task_id
            }
        
        except Exception as e:
            print(f"[Jiekou FLUX Kontext] 错误: {e}")
            return {
                "success": False,
                "error": str(e)
            }


# ==========================================
# GPT 文生图 - 文生图
# ==========================================
class GPTImageProvider(JiekouBaseClient):
    """
    GPT Image 模型
    类型：文生图
    特点：适合多种尺寸和质量选项
    """
    
    def generate(
        self,
        prompt: str,
        image_base64s: Optional[List[str]] = None,
        model: str = "gpt-image-1",
        quality: str = "auto",
        size: str = "1024x1024",
        n: int = 1,
        **kwargs
    ) -> Dict[str, Any]:
        """
        生成图片
        
        Args:
            prompt: 提示词
            image_base64s: 忽略（纯文生图）
            model: 模型名称（必填，目前仅支持 gpt-image-1）
            quality: 质量（auto/high/medium/low，默认 auto）
            size: 尺寸（字符串格式，必须是 "1024x1024", "1536x1024", "1024x1536", "auto" 之一）
            n: 生成数量（整数，默认 1）
        """
        try:
            # 验证 size 参数（API 只支持特定尺寸）
            valid_sizes = ["1024x1024", "1536x1024", "1024x1536", "auto"]
            if size not in valid_sizes:
                print(f"[Jiekou GPT Image] 警告: size={size} 无效，使用默认值 1024x1024")
                size = "1024x1024"
            
            # 构建请求体，严格按照 API 文档格式
            payload = {
                "model": model,  # 必填，目前仅支持 gpt-image-1
                "prompt": prompt,  # 必填，最大长度 32000 字符
                "quality": quality,  # 可选，auto/high/medium/low
                "n": n,  # 整数，生成数量
                "size": size  # 字符串，图片尺寸（已验证）
            }
            
            print(f"[Jiekou GPT Image] 文生图模式")
            print(f"[Jiekou GPT Image] 请求体: model={model}, prompt长度={len(prompt)}, quality={quality}, n={n}, size={size}")
            
            # 记录开始时间
            start_time = time.time()
            
            # 调用 API，确保请求头已正确设置
            response = self._make_request("POST", "/v1/images/generations", json=payload)
            
            # 计算API响应时间
            api_elapsed = time.time() - start_time
            
            # 调试：打印完整响应结构（仅前500字符，避免过长）
            response_str = str(response)
            if len(response_str) > 500:
                print(f"[Jiekou GPT Image] 🔍 响应结构预览: {response_str[:500]}...")
            else:
                print(f"[Jiekou GPT Image] 🔍 完整响应: {response}")
            
            # 解析响应参数（根据API文档，优先从响应中获取，如果没有则使用请求参数）
            created = response.get("created", int(time.time()))
            output_format = response.get("output_format", "png")  # 默认png
            response_quality = response.get("quality", quality)  # 如果响应没有，使用请求参数
            response_size = response.get("size", size)  # 如果响应没有，使用请求参数
            data_count = len(response.get("data", [])) if isinstance(response.get("data"), list) else 0
            
            # 如果响应中没有这些字段，从请求参数中获取（因为API可能不返回这些）
            if response_quality == quality and "quality" not in response:
                response_quality = quality
            if response_size == size and "size" not in response:
                response_size = size
            
            # 输出响应参数信息
            print(f"[Jiekou GPT Image] 📊 响应参数:")
            print(f"  - created: {created} (Unix时间戳)")
            print(f"  - output_format: {output_format}")
            print(f"  - quality: {response_quality} {'(来自请求)' if response_quality == quality and 'quality' not in response else '(来自响应)'}")
            print(f"  - size: {response_size} {'(来自请求)' if response_size == size and 'size' not in response else '(来自响应)'}")
            print(f"  - data数组长度: {data_count}")
            
            # 直接返回结果（同步API）
            image_url = self._extract_image_url(response)
            
            # 计算总耗时
            total_elapsed = time.time() - start_time
            
            # 输出时间统计
            print(f"[Jiekou GPT Image] ⏱️ 时间统计:")
            print(f"  - API响应时间: {api_elapsed:.2f}秒")
            print(f"  - 总处理时间: {total_elapsed:.2f}秒")
            
            return {
                "success": True,
                "image_url": image_url,
                "response_info": {
                    "created": created,
                    "output_format": output_format,
                    "quality": response_quality,
                    "size": response_size,
                    "data_count": data_count
                },
                "timing": {
                    "api_elapsed": api_elapsed,
                    "total_elapsed": total_elapsed
                }
            }
        
        except Exception as e:
            print(f"[Jiekou GPT Image] 错误: {e}")
            return {
                "success": False,
                "error": str(e)
            }


# ==========================================
# Qwen-Image 图像编辑 - 图生图
# ==========================================
class QwenImageProvider(JiekouBaseClient):
    """
    Qwen-Image 图像编辑模型
    类型：图生图
    特点：基于20B MMDiT模型的图像编辑
    """
    
    def generate(
        self,
        prompt: str,
        image_base64s: List[str],
        seed: int = -1,
        output_format: str = "png",
        **kwargs
    ) -> Dict[str, Any]:
        """
        编辑图片
        
        Args:
            prompt: 编辑提示词
            image_base64s: 输入图片列表（必需）
            seed: 随机种子
            output_format: 输出格式
        """
        try:
            if not image_base64s or len(image_base64s) == 0:
                raise ValueError("Qwen-Image 需要至少一张输入图片")
            
            payload = {
                "prompt": prompt,
                "image": image_base64s[0],  # 使用第一张图片
                "seed": seed,
                "output_format": output_format
            }
            
            print(f"[Jiekou Qwen-Image] 图像编辑模式")
            
            # 调用异步API
            response = self._make_request("POST", "/v3/async/qwen-image-edit", json=payload)
            task_id = response.get("task_id")
            
            if not task_id:
                raise JiekouAPIError("未返回 task_id")
            
            print(f"[Jiekou Qwen-Image] 任务ID: {task_id}")
            
            # 轮询结果
            result = self._poll_task_result(task_id)
            image_url = self._extract_image_url(result)
            
            return {
                "success": True,
                "image_url": image_url,
                "task_id": task_id
            }
        
        except Exception as e:
            print(f"[Jiekou Qwen-Image] 错误: {e}")
            return {
                "success": False,
                "error": str(e)
            }


# ==========================================
# Gemini 3 Pro Image Preview - 文生图
# ==========================================
class Gemini3ProImageProvider(JiekouBaseClient):
    """
    Gemini 3 Pro Image Preview 模型
    类型：文生图
    特点：Nano Banana 高质量图像生成
    """
    
    def generate(
        self,
        prompt: str,
        image_base64s: Optional[List[str]] = None,
        aspect_ratio: str = "1:1",
        size: str = "1K",
        **kwargs
    ) -> Dict[str, Any]:
        """
        生成图片
        
        Args:
            prompt: 提示词（必填）
            image_base64s: 忽略（纯文生图，不支持图生图）
            aspect_ratio: 宽高比（可选，支持: 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9）
            size: 尺寸（可选，默认 "1K"，支持: 1K, 2K, 4K）
        """
        try:
            # 验证 aspect_ratio 参数
            valid_aspect_ratios = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
            if aspect_ratio not in valid_aspect_ratios:
                print(f"[Jiekou Gemini3 Pro Image] 警告: aspect_ratio={aspect_ratio} 无效，使用默认值 1:1")
                aspect_ratio = "1:1"
            
            # 验证 size 参数
            valid_sizes = ["1K", "2K", "4K"]
            if size not in valid_sizes:
                print(f"[Jiekou Gemini3 Pro Image] 警告: size={size} 无效，使用默认值 1K")
                size = "1K"
            
            # 构建请求体（仅支持 prompt, aspect_ratio, size）
            payload = {
                "prompt": prompt
            }
            
            # 可选参数
            if aspect_ratio:
                payload["aspect_ratio"] = aspect_ratio
            if size:
                payload["size"] = size
            
            print(f"[Jiekou Gemini3 Pro Image] 文生图模式")
            print(f"[Jiekou Gemini3 Pro Image] 请求参数: prompt长度={len(prompt)}, aspect_ratio={aspect_ratio}, size={size}")
            
            # 记录开始时间
            start_time = time.time()
            
            # 调用 API
            response = self._make_request("POST", "/v3/gemini-3-pro-image-text-to-image", json=payload)
            
            # 计算API响应时间
            api_elapsed = time.time() - start_time
            
            # 解析响应（根据API文档，响应包含 image_urls 数组）
            image_urls = response.get("image_urls", [])
            if not isinstance(image_urls, list) or len(image_urls) == 0:
                raise JiekouAPIError("响应中未找到 image_urls 或数组为空")
            
            # 使用第一张图片
            image_url = image_urls[0]
            
            # 输出响应信息
            print(f"[Jiekou Gemini3 Pro Image] 📊 响应参数:")
            print(f"  - image_urls数组长度: {len(image_urls)}")
            print(f"  - 使用的图片URL: {image_url[:80]}..." if len(image_url) > 80 else f"  - 使用的图片URL: {image_url}")
            
            # 计算总耗时
            total_elapsed = time.time() - start_time
            
            # 输出时间统计
            print(f"[Jiekou Gemini3 Pro Image] ⏱️ 时间统计:")
            print(f"  - API响应时间: {api_elapsed:.2f}秒")
            print(f"  - 总处理时间: {total_elapsed:.2f}秒")
            
            return {
                "success": True,
                "image_url": image_url,
                "image_urls": image_urls,  # 返回所有图片URL
                "response_info": {
                    "image_count": len(image_urls),
                    "aspect_ratio": aspect_ratio,
                    "size": size
                },
                "timing": {
                    "api_elapsed": api_elapsed,
                    "total_elapsed": total_elapsed
                }
            }
        
        except Exception as e:
            print(f"[Jiekou Gemini3 Pro Image] 错误: {e}")
            return {
                "success": False,
                "error": str(e)
            }


# ==========================================
# FLUX.1 Schnell - 文生图
# ==========================================
class FluxSchnellProvider(JiekouBaseClient):
    """
    FLUX.1 Schnell 模型
    类型：文生图
    特点：快速生成高质量图像
    """
    
    def generate(
        self,
        prompt: str,
        image_base64s: Optional[List[str]] = None,
        width: int = 1024,
        height: int = 1024,
        num_inference_steps: int = 4,
        **kwargs
    ) -> Dict[str, Any]:
        """
        生成图片
        
        Args:
            prompt: 提示词
            image_base64s: 忽略（纯文生图）
            width: 宽度
            height: 高度
            num_inference_steps: 推理步数
        """
        try:
            payload = {
                "prompt": prompt,
                "width": width,
                "height": height,
                "num_inference_steps": num_inference_steps
            }
            
            print(f"[Jiekou FLUX Schnell] 文生图模式")
            
            # 调用异步API
            response = self._make_request("POST", "/v3/async/flux-schnell", json=payload)
            task_id = response.get("task_id")
            
            if not task_id:
                raise JiekouAPIError("未返回 task_id")
            
            print(f"[Jiekou FLUX Schnell] 任务ID: {task_id}")
            
            # 轮询结果
            result = self._poll_task_result(task_id)
            image_url = self._extract_image_url(result)
            
            return {
                "success": True,
                "image_url": image_url,
                "task_id": task_id
            }
        
        except Exception as e:
            print(f"[Jiekou FLUX Schnell] 错误: {e}")
            return {
                "success": False,
                "error": str(e)
            }


# ==========================================
# Stable Diffusion 3.5 Large - 文生图
# ==========================================
class SD35LargeProvider(JiekouBaseClient):
    """
    Stable Diffusion 3.5 Large 模型
    类型：文生图
    特点：高质量、详细的图像生成
    """
    
    def generate(
        self,
        prompt: str,
        image_base64s: Optional[List[str]] = None,
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 7.5,
        num_inference_steps: int = 40,
        **kwargs
    ) -> Dict[str, Any]:
        """
        生成图片
        
        Args:
            prompt: 提示词
            image_base64s: 忽略（纯文生图）
            negative_prompt: 负面提示词
            width: 宽度
            height: 高度
            guidance_scale: 引导强度
            num_inference_steps: 推理步数
        """
        try:
            payload = {
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "width": width,
                "height": height,
                "guidance_scale": guidance_scale,
                "num_inference_steps": num_inference_steps
            }
            
            print(f"[Jiekou SD 3.5 Large] 文生图模式")
            
            # 调用异步API
            response = self._make_request("POST", "/v3/async/sd-3.5-large", json=payload)
            task_id = response.get("task_id")
            
            if not task_id:
                raise JiekouAPIError("未返回 task_id")
            
            print(f"[Jiekou SD 3.5 Large] 任务ID: {task_id}")
            
            # 轮询结果
            result = self._poll_task_result(task_id)
            image_url = self._extract_image_url(result)
            
            return {
                "success": True,
                "image_url": image_url,
                "task_id": task_id
            }
        
        except Exception as e:
            print(f"[Jiekou SD 3.5 Large] 错误: {e}")
            return {
                "success": False,
                "error": str(e)
            }


# ==========================================
# Recraft V3 - 文生图
# ==========================================
class RecraftV3Provider(JiekouBaseClient):
    """
    Recraft V3 模型
    类型：文生图
    特点：设计风格图像生成
    """
    
    def generate(
        self,
        prompt: str,
        image_base64s: Optional[List[str]] = None,
        style: str = "realistic_image",
        size: str = "1024x1024",
        **kwargs
    ) -> Dict[str, Any]:
        """
        生成图片
        
        Args:
            prompt: 提示词
            image_base64s: 忽略（纯文生图）
            style: 风格类型
            size: 尺寸
        """
        try:
            payload = {
                "prompt": prompt,
                "style": style,
                "size": size
            }
            
            print(f"[Jiekou Recraft V3] 文生图模式")
            
            # 调用异步API
            response = self._make_request("POST", "/v3/async/recraft-v3", json=payload)
            task_id = response.get("task_id")
            
            if not task_id:
                raise JiekouAPIError("未返回 task_id")
            
            print(f"[Jiekou Recraft V3] 任务ID: {task_id}")
            
            # 轮询结果
            result = self._poll_task_result(task_id)
            image_url = self._extract_image_url(result)
            
            return {
                "success": True,
                "image_url": image_url,
                "task_id": task_id
            }
        
        except Exception as e:
            print(f"[Jiekou Recraft V3] 错误: {e}")
            return {
                "success": False,
                "error": str(e)
            }

