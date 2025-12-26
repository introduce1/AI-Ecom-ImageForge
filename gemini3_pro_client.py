# ==========================================
# Gemini 3 Pro Image Edit API 客户端
# ==========================================

import requests
import base64
import os
import re
import uuid
from typing import List, Optional, Dict, Any

GEMINI3_PRO_API_KEY = "sk_HLvA0uFTKfimSnd9-XKIvkA-EZYK6_oDqWm3WuKv5Hc"


def _collect_strings(obj):
    if obj is None:
        return
    if isinstance(obj, str):
        yield obj
        return
    if isinstance(obj, dict):
        for v in obj.values():
            yield from _collect_strings(v)
        return
    if isinstance(obj, list):
        for v in obj:
            yield from _collect_strings(v)
        return


def _detect_ext_from_bytes(image_bytes: bytes) -> str:
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if image_bytes.startswith(b"\xff\xd8"):
        return "jpg"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return "webp"
    return "png"


def _save_bytes(image_bytes: bytes, output_dir: str, filename_hint: str) -> str:
    os.makedirs(output_dir, exist_ok=True)
    ext = _detect_ext_from_bytes(image_bytes)
    filename = f"{filename_hint}_{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(output_dir, filename)
    with open(file_path, "wb") as f:
        f.write(image_bytes)
    return filename

class Gemini3ProClient:
    def __init__(self, api_key: str):
        """
        初始化 Gemini 3 Pro 客户端
        
        Args:
            api_key: API 密钥 (Authorization header)
        """
        if not api_key:
            raise ValueError("缺少 API Key")
        self.api_key = api_key
        self.base_url = "https://api.jiekou.ai/v3/gemini-3-pro-image-edit"
        
    def edit_image(
        self,
        prompt: str,
        image_urls: Optional[List[str]] = None,
        image_base64s: Optional[List[str]] = None,
        aspect_ratio: Optional[str] = None,
        size: Optional[str] = None  # 必须是 "1K", "2K", "4K" 中的一个
    ) -> Dict[str, Any]:
        """
        调用 Gemini 3 Pro Image Edit API
        
        Args:
            prompt: 编辑提示词
            image_urls: 图片 URL 列表
            image_base64s: 图片 base64 编码列表
            aspect_ratio: 宽高比 (如 "16:9", "1:1", "4:3")
            size: 图片尺寸，必须是 "1K", "2K", "4K" 中的一个
            
        Returns:
            API 响应结果
        """
        # 构建请求数据
        payload = {
            "prompt": prompt
        }
        
        # 可选参数
        if image_urls:
            payload["image_urls"] = image_urls
        if image_base64s:
            payload["image_base64s"] = image_base64s
        if aspect_ratio:
            payload["aspect_ratio"] = aspect_ratio
        if size:
            # 验证 size 参数
            valid_sizes = ["1K", "2K", "4K"]
            if size not in valid_sizes:
                raise ValueError(f"size 参数必须是 {valid_sizes} 中的一个，当前为: {size}")
            payload["size"] = size
        
        # 设置请求头
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        try:
            # 禁用代理，直连 API（避免代理连接问题）
            proxies = {
                'http': None,
                'https': None
            }
            
            # 发送 POST 请求，增加超时时间
            # timeout=(连接超时, 读取超时) - 连接超时30秒，读取超时300秒（5分钟）
            response = requests.post(
                self.base_url,
                headers=headers,
                json=payload,
                timeout=(30, 300),  # (connect timeout, read timeout)
                proxies=proxies
            )
            
            # 检查响应状态
            response.raise_for_status()
            
            return response.json()
            
        except requests.exceptions.Timeout as e:
            error_msg = f"API 请求超时: {e}"
            print(f"API 请求失败: {error_msg}")
            print("提示: 图片可能过大或网络连接较慢，请稍后重试")
            raise requests.exceptions.RequestException(error_msg) from e
        except requests.exceptions.RequestException as e:
            print(f"API 请求失败: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"响应状态码: {e.response.status_code}")
                print(f"响应内容: {e.response.text}")
            raise

    def edit_image_to_bytes(
        self,
        prompt: str,
        image_urls: Optional[List[str]] = None,
        image_base64s: Optional[List[str]] = None,
        aspect_ratio: Optional[str] = None,
        size: Optional[str] = None,
    ) -> bytes:
        result = self.edit_image(
            prompt=prompt,
            image_urls=image_urls,
            image_base64s=image_base64s,
            aspect_ratio=aspect_ratio,
            size=size,
        )

        strings = list(_collect_strings(result))

        url_re = re.compile(r"https?://[^\s\"\']+")
        url_candidates = []
        for s in strings:
            for u in url_re.findall(s):
                url_candidates.append(u.rstrip(")]}>.,\""))

        # 禁用代理下载图片
        proxies = {'http': None, 'https': None}
        
        for url in url_candidates:
            try:
                resp = requests.get(url, timeout=(30, 120), proxies=proxies)  # 增加下载超时时间
                if resp.status_code == 200 and resp.content:
                    return resp.content
            except requests.exceptions.Timeout:
                print(f"下载图片超时: {url}，尝试下一个URL")
                continue
            except requests.exceptions.RequestException as e:
                print(f"下载图片失败: {url}, 错误: {e}，尝试下一个URL")
                continue

        base64_candidates = []
        for s in strings:
            if s.startswith("data:image/") and ";base64," in s:
                base64_candidates.append(s.split(";base64,", 1)[1])
            elif len(s) > 512 and re.fullmatch(r"[A-Za-z0-9+/=\s]+", s or ""):
                base64_candidates.append(s.strip())

        for b64 in base64_candidates:
            image_bytes = base64.b64decode(b64, validate=False)
            if image_bytes:
                return image_bytes

        raise ValueError("未能从 Gemini 响应中提取图片")

    def edit_image_to_uploads_url(
        self,
        prompt: str,
        image_urls: Optional[List[str]] = None,
        image_base64s: Optional[List[str]] = None,
        aspect_ratio: Optional[str] = None,
        size: Optional[str] = None,
        static_folder: str = "static",
        uploads_subdir: str = "uploads",
        url_prefix: str = "/uploads",
        filename_hint: str = "ai_image",
    ) -> str:
        image_bytes = self.edit_image_to_bytes(
            prompt=prompt,
            image_urls=image_urls,
            image_base64s=image_base64s,
            aspect_ratio=aspect_ratio,
            size=size,
        )

        output_dir = os.path.join(static_folder, uploads_subdir)
        # 确保目录存在
        os.makedirs(output_dir, exist_ok=True)
        filename = _save_bytes(image_bytes, output_dir=output_dir, filename_hint=filename_hint)
        
        # 验证文件是否成功保存
        file_path = os.path.join(output_dir, filename)
        if not os.path.exists(file_path):
            raise RuntimeError(f"文件保存失败: {file_path}")
        
        print(f"[文件保存] 成功保存到: {file_path}")
        return f"{url_prefix}/{filename}"

    def generate(
        self,
        prompt: str,
        image_urls: Optional[List[str]] = None,
        image_base64s: Optional[List[str]] = None,
        aspect_ratio: Optional[str] = None,
        size: Optional[str] = None,
        static_folder: str = "static",
        uploads_subdir: str = "uploads",
        url_prefix: str = "/uploads",
        filename_hint: str = "ai_image",
    ) -> Dict[str, Any]:
        try:
            image_url = self.edit_image_to_uploads_url(
                prompt=prompt,
                image_urls=image_urls,
                image_base64s=image_base64s,
                aspect_ratio=aspect_ratio,
                size=size,
                static_folder=static_folder,
                uploads_subdir=uploads_subdir,
                url_prefix=url_prefix,
                filename_hint=filename_hint,
            )
            return {"success": True, "image_url": image_url}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def edit_image_from_file(
        self,
        prompt: str,
        image_path: str,
        aspect_ratio: Optional[str] = None,
        size: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        从本地文件调用 Gemini 3 Pro Image Edit API
        
        Args:
            prompt: 编辑提示词
            image_path: 本地图片路径
            aspect_ratio: 宽高比
            size: 图片尺寸
            
        Returns:
            API 响应结果
        """
        # 读取图片并转换为 base64
        with open(image_path, "rb") as image_file:
            image_data = image_file.read()
            image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        return self.edit_image(
            prompt=prompt,
            image_base64s=[image_base64],
            aspect_ratio=aspect_ratio,
            size=size
        )

class ImageEditingPrompts:
    """
    图片编辑提示词生成器
    """
    
    def remove_defects_prompt(self, subject: str = "photo") -> str:
        return f"移除这张{subject}中的所有瑕疵、污点或缺陷。保持图片的其他部分不变。高质量、干净。"

    def upscale_prompt(self) -> str:
        return "将这张图片放大至高分辨率，增强细节和清晰度。4K 画质。"

    def product_migration_prompt(self) -> str:
        return """[任务] 产品迁移融合

[核心约束 - 绝对遵守]
1. 第二张图片（场景图）是基底，必须100%保留其所有内容：
   - 所有文字、文案、品牌名、Logo、标签、说明文字
   - 所有背景元素、装饰物、其他物品
   - 原始的构图、布局、尺寸、比例
   - 原有的色调、光线、风格
2. 第一张图片仅作为产品参考，只提取主体产品
3. 禁止改变、删除、模糊或覆盖场景图的任何文字
4. 禁止改变场景图的构图和物体位置
5. 禁止拉伸、压缩或形变场景图中的任何元素

[操作步骤]
1. 从第一张图提取主要产品（去除其背景和无关元素）
2. 在第二张图（场景图）中找到合适的放置位置
3. 如果场景中有同类产品，替换它；否则添加到空白区域
4. 将提取的产品自然融入场景

[融合要求]
- 产品的光照、阴影必须与场景完全一致
- 产品的大小、角度、透视要符合场景的空间关系
- 色调、饱和度要与场景和谐统一
- 边缘要自然过渡，无PS痕迹
- 产品要看起来原本就在这个场景中

[最终检查]
- 场景图的所有文字是否完整保留？
- 场景图的构图和布局是否未被改变？
- 场景图的其他物体是否保持原样？
- 产品融入是否自然？"""
    
    def product_migration_with_instruction_prompt(self, instruction: str) -> str:
        return f"""[任务] 产品迁移融合（带用户指令）

[用户指令]
{instruction}

[核心约束 - 绝对遵守]
1. 第二张图片（场景图）是基底，必须100%保留其所有内容：
   - 所有文字、文案、品牌名、Logo、标签、说明文字
   - 所有背景元素、装饰物、其他物品
   - 原始的构图、布局、尺寸、比例
   - 原有的色调、光线、风格
2. 第一张图片仅作为产品参考，只提取主体产品
3. 禁止改变、删除、模糊或覆盖场景图的任何文字
4. 禁止改变场景图的构图和物体位置
5. 禁止拉伸、压缩或形变场景图中的任何元素

工作流程：
1. 根据用户指令，准确识别第一张图片中要迁移的产品
2. 将该产品提取出来
3. 根据指令要求，放置到第二张图片的场景中（可能是替换场景中已有的产品，或者添加到场景中）
4. 进行自然融合处理

融合要求：
- 完美匹配场景的光照、阴影、反射和透视效果
- 调整产品的颜色、色调、大小和角度，使其与场景和谐统一
- 特别注意深度、比例和空间关系
- 让产品看起来原本就属于该场景
- 避免任何人工或PS的痕迹
- 确保边缘平滑、过渡自然
- 严格保持场景图的所有文字和文案不变"""

    def remove_watermark_prompt(self) -> str:
        return "提升这张图片的清晰度和质量，去除任何干扰元素，保持原始尺寸。增强细节，使图片更清晰自然。"

    def extract_pattern_prompt(self) -> str:
        return "完全移除背景，只保留主体/物体。将背景替换为纯白色背景（#FFFFFF）。确保主体边缘清晰、干净。"

    def replace_text_prompt(self, instruction: str) -> str:
        return f"根据以下指令修改图片中的文字：{instruction}。保持字体样式和背景的一致性。"

    def replace_background_reference_prompt(self, subject: str) -> str:
        return f"将这个{subject}的背景替换为提供的参考背景图片。保持真实的光照和阴影。"

    def replace_background_text_prompt(self, subject: str, prompt_text: str) -> str:
        return f"将这个{subject}的背景替换为：{prompt_text}。确保真实的融合效果。"
    
    def replace_background_with_instruction_prompt(self, instruction: str = '', keep_logo: str = 'yes', keep_text: str = 'yes') -> str:
        """带细致要求的背景替换 - 简化版提示词
        
        约定：
        - 第一张图片：产品图（含产品主体、产品上的 logo 和文案）
        - 第二张图片：背景图（只提供场景背景，不使用其 logo / 文案）
        """
        # 基础指令
        parts = ["将第一张图片的产品主体保持不变，只替换背景为第二张图片的场景背景"]
        
        # 产品图保留要求
        if keep_logo == 'yes' and keep_text == 'yes':
            parts.append("保留产品图上的所有logo和文字")
        elif keep_logo == 'yes':
            parts.append("保留产品图上的logo，移除文字")
        elif keep_text == 'yes':
            parts.append("保留产品图上的文字，移除logo")
        else:
            parts.append("移除产品图上的logo和文字")
        
        # 背景图要求
        parts.append("只使用第二张图片的纯背景，忽略其logo和文字")
        
        # 用户特殊要求
        if instruction:
            parts.append(f"特殊要求：{instruction}")
        
        # 融合要求
        parts.append("自然融合，匹配光照和色调，保持产品细节不变")
        
        # 组合成简洁的提示词
        prompt = "。".join(parts) + "。"
        return prompt

    def expand_image_prompt(self) -> str:
        return "补全并恢复这张图片中不完整的部分。智能填充被裁剪或缺失的区域，创建一张完整、自然的图片。无缝扩展内容以匹配现有的风格、颜色和构图。"

    def logo_fusion_prompt(self) -> str:
        return """自然地将logo融入图片表面/纹理中。让它看起来像是真实印刷或物理放置在那里的。

重要要求：
1. 必须保持原图的尺寸、宽度和高度完全不变
2. 保持原图的质量和所有细节
3. 只是自然融合 logo，不改变图片的任何其他部分
4. 输出图片尺寸必须与输入图片完全相同"""

    def logo_add_prompt(self) -> str:
        return """将第二张图片（logo）添加到第一张图片（基础图片）上。

要求：
1. 保持第一张基础图片的原始尺寸、宽度和高度完全不变
2. 将 logo 自然地融合到基础图片上，选择合适的位置放置
3. 确保 logo 清晰可见但不影响基础图片的主体内容
4. 保持基础图片的质量和细节
5. 输出图片必须与基础图片尺寸完全相同"""
    
    def text_inpainting_prompt(self, x: int, y: int, width: int, height: int) -> str:
        """文字去除提示词 - 智能修复指定区域"""
        return f"""请对这张图片进行智能修复处理：

[任务] 移除指定区域内的所有文字，并用自然的背景填充

[目标区域]
- 位置：从坐标 ({x}, {y}) 开始
- 尺寸：宽 {width} 像素，高 {height} 像素

[处理要求]
1. 完全移除该区域内的所有文字、字符和文本痕迹
2. 智能分析周围背景的纹理、颜色和图案
3. 用自然连贯的背景填充该区域，确保：
   - 纹理连续性：与周围背景纹理完美衔接
   - 色彩匹配：颜色、亮度、饱和度与周围一致
   - 无缝融合：看不出任何修复痕迹
4. 保持图片其他区域完全不变
5. 输出图片必须保持原始尺寸和分辨率

[效果标准]
最终效果应该让人完全看不出该区域原本有文字，就像原图就是这样的。"""