# ==========================================
# AI 图像处理助手 - Flask 后端服务器
# 使用 Gemini 3 Pro Image Edit 模型
# ==========================================

from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import os
import requests
import base64
import uuid
from werkzeug.utils import secure_filename
from image_uploader import ImageUploader
from local_storage import LocalImageStorage
from gemini3_pro_client import Gemini3ProClient, ImageEditingPrompts
import image_processing
from PIL import Image
import io
from ocr_service import get_ocr_service

app = Flask(__name__, static_folder='static')
CORS(app)

# 配置LOGO文件夹静态访问
@app.route('/LOGO/<path:filename>')
def serve_logo(filename):
    """提供Logo文件访问"""
    from flask import send_from_directory
    return send_from_directory('LOGO', filename)

GEMINI3_PRO_API_KEY = "sk_HLvA0uFTKfimSnd9-XKIvkA-EZYK6_oDqWm3WuKv5Hc"

gemini3_client = Gemini3ProClient(GEMINI3_PRO_API_KEY) if GEMINI3_PRO_API_KEY else None
prompt_agent = ImageEditingPrompts()

# 全局进度跟踪（内存存储）
batch_progress = {}

# ==========================================
# 图片存储配置
# ==========================================
USE_LOCAL_STORAGE = False  # ✅ 使用 ImgBB 在线图床（已修复代理问题）

if USE_LOCAL_STORAGE:
    local_storage = LocalImageStorage(upload_folder='static/uploads', base_url='http://localhost:5000')
    print("[配置] 使用本地图片存储")
else:
    image_uploader = ImageUploader('imgbb')
    print("[配置] 使用 ImgBB 在线图床")

# ==========================================
# 辅助函数
# ==========================================
def upload_image(file):
    """上传/保存图片并返回 URL"""
    try:
        print(f"[上传] 开始读取文件...")
        file_bytes = file.read()
        filename = secure_filename(file.filename)
        print(f"[上传] 文件大小: {len(file_bytes)} bytes, 文件名: {filename}")
        
        if USE_LOCAL_STORAGE:
            print(f"[上传] 保存到本地...")
            result = local_storage.save_image(file_bytes, filename)
        else:
            print(f"[上传] 上传到图床...")
            result = image_uploader.upload(file_bytes, filename)
        
        print(f"[上传] 返回结果: {result}")
        
        if result['success']:
            print(f"[上传] ✅ 成功: {result['url']}")
            return {"success": True, "url": result['url']}
        else:
            print(f"[上传] ❌ 失败: {result['error']}")
            return {"success": False, "error": result['error']}
            
    except Exception as e:
        error_msg = f"上传异常: {str(e)}"
        print(f"[上传] ❌ {error_msg}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": error_msg}


def _ensure_gemini_client():
    if not gemini3_client:
        return {"success": False, "error": "未配置 Gemini 3 Pro API Key，请在 app.py 顶部 GEMINI3_PRO_API_KEY 中填写。"}
    return None


def _bytes_to_base64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode('utf-8')


def _file_to_base64(file_storage) -> str:
    # 读取文件内容
    file_bytes = file_storage.read()
    
    # 尝试转换图片格式 (例如 AVIF -> PNG)以确保 API 兼容性
    try:
        # 使用 Pillow 打开图片
        img = Image.open(io.BytesIO(file_bytes))
        
        # 检查是否需要转换 (非 JPEG/PNG 或特殊模式)
        # 很多 API 不支持 AVIF, WEBP 等，统转 PNG 最安全
        if img.format not in ['JPEG', 'PNG'] or img.mode == 'CMYK':
            print(f"[处理] 检测到图片格式 {img.format} (Mode: {img.mode})，正在转换为 PNG...")
            
            output_buffer = io.BytesIO()
            # 转换 CMYK 到 RGB (PNG 不支持 CMYK)
            if img.mode == 'CMYK':
                img = img.convert('RGB')
                
            img.save(output_buffer, format="PNG")
            file_bytes = output_buffer.getvalue()
            
    except Exception as e:
        print(f"[处理] 图片格式检查/转换失败 (将使用原始数据): {e}")
        # 如果 Pillow 无法打开，则回退到原始数据
        
    return _bytes_to_base64(file_bytes)


def _gemini_edit_to_local_url(prompt: str, image_base64s, aspect_ratio: str = None, size: str = None) -> str:
    missing = _ensure_gemini_client()
    if missing:
        raise RuntimeError(missing["error"])

    result = gemini3_client.generate(
        prompt=prompt,
        image_base64s=image_base64s,
        aspect_ratio=aspect_ratio,
        size=size,
        static_folder=app.static_folder,
    )

    if not result.get("success"):
        raise RuntimeError(result.get("error") or "生成失败")
    return result["image_url"]


def _gemini_edit_to_local_url_with_resize(
    prompt: str, 
    image_base64s, 
    target_width: int, 
    target_height: int,
    aspect_ratio: str = None, 
    size: str = None
) -> str:
    """
    调用 Gemini API 生成图片，并确保输出尺寸与目标尺寸一致
    
    Args:
        prompt: 提示词
        image_base64s: 图片 base64 列表
        target_width: 目标宽度
        target_height: 目标高度
        aspect_ratio: 宽高比
        size: 输出质量
        
    Returns:
        生成图片的本地 URL
    """
    missing = _ensure_gemini_client()
    if missing:
        raise RuntimeError(missing["error"])

    # 先生成图片
    image_bytes = gemini3_client.edit_image_to_bytes(
        prompt=prompt,
        image_base64s=image_base64s,
        aspect_ratio=aspect_ratio,
        size=size,
    )
    
    # 检查生成的图片尺寸
    img = Image.open(io.BytesIO(image_bytes))
    generated_width, generated_height = img.size
    print(f"[处理] 生成图片尺寸: {generated_width}x{generated_height}")
    print(f"[处理] 目标图片尺寸: {target_width}x{target_height}")
    
    # 如果尺寸不匹配，调整到目标尺寸
    if generated_width != target_width or generated_height != target_height:
        print(f"[处理] 调整图片尺寸到: {target_width}x{target_height}")
        image_bytes = image_processing.resize_to_dimensions(
            image_bytes, 
            target_width, 
            target_height,
            maintain_quality=True
        )
    else:
        print(f"[处理] 尺寸已匹配，无需调整")
    
    # 保存到本地
    output_dir = os.path.join(app.static_folder, "uploads")
    os.makedirs(output_dir, exist_ok=True)
    
    # 生成文件名
    filename = f"logo_result_{uuid.uuid4().hex}.png"
    file_path = os.path.join(output_dir, filename)
    
    with open(file_path, 'wb') as f:
        f.write(image_bytes)
    
    print(f"[处理] 已保存: {filename}")
    return f"/uploads/{filename}"

# ==========================================
# 静态文件服务
# ==========================================
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    """提供上传文件的访问"""
    import os
    uploads_dir = os.path.join(app.static_folder, 'uploads')
    # 检查文件是否存在
    file_path = os.path.join(uploads_dir, filename)
    if not os.path.exists(file_path):
        print(f"[警告] 文件不存在: {file_path}")
        print(f"[调试] static_folder: {app.static_folder}")
        print(f"[调试] uploads_dir: {uploads_dir}")
        print(f"[调试] 请求的文件: {filename}")
        return jsonify({"error": "文件不存在", "filename": filename, "path": file_path}), 404
    return send_from_directory(uploads_dir, filename)

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

# ==========================================
# API 路由 - 使用 Gemini 3 Pro 模型
# ==========================================

@app.route('/api/chat', methods=['POST'])
def chat_route():
    """AI 助手对话接口（支持多张图片）"""
    print(f"\n[API] ========== Chat 请求 ==========")
    
    prompt = request.form.get('prompt', '')
    
    # 支持多张图片
    image_count = request.form.get('image_count')
    images = []
    
    if image_count:
        # 多张图片模式
        image_count = int(image_count)
        print(f"[API] 用户上传了 {image_count} 张图片")
        for i in range(image_count):
            img_file = request.files.get(f'image{i}')
            if img_file:
                images.append(img_file)
                print(f"[API] 图片{i+1}: {img_file.filename}")
    else:
        # 单张图片模式（兼容旧代码）
        image_file = request.files.get('image')
        if image_file:
            images.append(image_file)
            print(f"[API] 用户上传图片: {image_file.filename}")
    
    print(f"[API] 用户输入: {prompt}")
        
    try:
        # 1. 如果有图片，优先进行基于图片的编辑/生成
        if images:
            # 将所有图片转为 base64
            image_base64s = [_file_to_base64(img) for img in images]
            
            final_prompt = prompt if prompt else "Optimize this image, make it look better, high quality, 8k."
            
            print(f"[API] 处理 {len(image_base64s)} 张图片，提示词: {final_prompt}")

            image_url = _gemini_edit_to_local_url(
                prompt=final_prompt,
                image_base64s=image_base64s,
            )

            return jsonify({
                "success": True,
                "message": "我已经根据你的要求处理了图片：",
                "image_url": image_url,
            })
                
        # 2. 如果只有文字，尝试文生图 (使用 Img2Img 接口 trick，或者返回提示)
        # 由于当前 Client 是 Img2Img，如果没有图，我们暂时只能提示用户上传
        # 或者，我们可以尝试用一个全黑/全白底图来做文生图 (Trick)
        else:
            if not prompt:
                return jsonify({"success": False, "error": "请输入内容"})
                
            # 简单的关键词匹配，引导用户使用快捷功能
            if "抠图" in prompt:
                 return jsonify({"success": True, "message": "想要抠图？请点击下方的【产品抠图】功能，或者直接在对话框上传一张图片并告诉我'帮我抠图'。"})
            if "放大" in prompt:
                 return jsonify({"success": True, "message": "想要高清放大？请点击下方的【高清放大】功能，或者上传图片告诉我'放大图片'。"})
            
            # 尝试作为生成指令 (Trick: 使用纯黑底图)
            # 这里我们返回一个引导信息，因为没有底图效果可能不好
            return jsonify({
                "success": True, 
                "message": "我目前主要擅长处理图片。请上传一张图片，然后告诉我你想怎么修改它（例如：'换成雪山背景'、'变成素描风格'）。"
            })
            
    except Exception as e:
        print(f"[API] Chat Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/remove-defects', methods=['POST'])
def remove_defects():
    """去瑕疵 - Gemini 3 Pro"""
    print(f"\n[API] ========== 去瑕疵请求 ==========")
    print(f"[API] 请求文件: {list(request.files.keys())}")
    
    if 'image' not in request.files:
        return jsonify({"success": False, "error": "未上传图片"}), 400
    
    file = request.files['image']
    print(f"[API] 文件: {file.filename}, 类型: {file.content_type}")
    
    try:
        image_b64 = _file_to_base64(file)

        prompt = prompt_agent.remove_defects_prompt("photo")
        print(f"[API] 提示词: {prompt}")

        image_url = _gemini_edit_to_local_url(prompt=prompt, image_base64s=[image_b64])
        return jsonify({"success": True, "image_url": image_url})
            
    except Exception as e:
        error_msg = f"异常: {str(e)}"
        print(f"[API] ❌ {error_msg}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": error_msg}), 500


@app.route('/api/upscale', methods=['POST'])
def upscale():
    """高清放大 - Gemini 3 Pro"""
    print(f"\n[API] ========== 高清放大请求 ==========")
    
    if 'image' not in request.files:
        return jsonify({"success": False, "error": "未上传图片"}), 400
    
    file = request.files['image']
    print(f"[API] 文件: {file.filename}")
    
    try:
        image_b64 = _file_to_base64(file)

        scale = request.form.get('scale', '2.0')
        prompt = prompt_agent.upscale_prompt() + f" Scale up {scale}x. Ultra sharp, 8k resolution, detailed texture."
        print(f"[API] 提示词: {prompt}")

        size = None
        try:
            scale_num = float(scale)
            if scale_num >= 4:
                size = "4K"
            elif scale_num >= 2:
                size = "2K"
            else:
                size = "1K"
        except Exception:
            size = None

        image_url = _gemini_edit_to_local_url(prompt=prompt, image_base64s=[image_b64], size=size)
        return jsonify({"success": True, "image_url": image_url})
            
    except Exception as e:
        print(f"[API] ❌ 异常: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/product-migration', methods=['POST'])
def product_migration():
    """产品迁移/场景融合 - 支持自定义指令"""
    print(f"\n[API] ========== 产品迁移请求 ==========")
    
    if 'product_image' not in request.files or 'scene_image' not in request.files:
        return jsonify({"success": False, "error": "请上传产品图和场景图"}), 400
        
    product_file = request.files['product_image']
    scene_file = request.files['scene_image']
    instruction = request.form.get('instruction', '').strip()
    
    print(f"[API] 产品图: {product_file.filename}")
    print(f"[API] 场景图: {scene_file.filename}")
    if instruction:
        print(f"[API] 用户指令: {instruction}")
    
    try:
        prod_b64 = _file_to_base64(product_file)
        scene_b64 = _file_to_base64(scene_file)
        
        # 获取场景图尺寸，确保输出尺寸一致
        scene_file.seek(0)
        scene_img = Image.open(io.BytesIO(scene_file.read()))
        scene_width, scene_height = scene_img.size
        print(f"[API] 场景图尺寸: {scene_width}x{scene_height}")

        # 根据用户指令生成提示词
        if instruction:
            prompt = prompt_agent.product_migration_with_instruction_prompt(instruction)
        else:
            prompt = prompt_agent.product_migration_prompt()
        
        # 在提示词末尾强调尺寸约束
        prompt += f"\n\n[严格要求] 输出图片必须保持场景图的原始尺寸：{scene_width}x{scene_height}像素，不允许任何缩放或形变。"
        
        print(f"[API] 提示词: {prompt}")

        # 使用带尺寸调整的函数，确保输出尺寸与场景图一致
        image_url = _gemini_edit_to_local_url_with_resize(
            prompt=prompt, 
            image_base64s=[prod_b64, scene_b64],
            target_width=scene_width,
            target_height=scene_height,
            size="1K"
        )
        return jsonify({"success": True, "image_url": image_url})
            
    except Exception as e:
        print(f"[API] ❌ 异常: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/remove-watermark', methods=['POST'])
def remove_watermark():
    """水印去除 - Gemini 3 Pro（使用高清优化技术，1倍原尺寸）"""
    print(f"\n[API] ========== 水印去除请求 ==========")
    
    if 'image' not in request.files:
        return jsonify({"success": False, "error": "未上传图片"}), 400
    
    file = request.files['image']
    print(f"[API] 文件: {file.filename}")
    
    try:
        image_b64 = _file_to_base64(file)
        
        # 使用高清优化提示词，保持原尺寸（1倍）
        scale = "1.0"
        prompt = prompt_agent.remove_watermark_prompt() + f" Maintain original size, enhance quality and clarity."
        print(f"[API] 提示词: {prompt}")
        print(f"[API] 倍数: {scale}x（原尺寸）")

        # 使用1K尺寸保持原图大小
        image_url = _gemini_edit_to_local_url(prompt=prompt, image_base64s=[image_b64], size="1K")
        return jsonify({"success": True, "image_url": image_url})
            
    except Exception as e:
        print(f"[API] ❌ 异常: {e}")
        return jsonify({"success": False, "error": str(e)}), 500



@app.route('/api/extract-pattern', methods=['POST'])
def extract_pattern():
    """提取图案/抠图 - Gemini 3 Pro"""
    print(f"\n[API] ========== 提取图案请求 ==========")
    
    if 'image' not in request.files:
        return jsonify({"success": False, "error": "未上传图片"}), 400
    
    file = request.files['image']
    print(f"[API] 文件: {file.filename}")
    
    try:
        image_b64 = _file_to_base64(file)

        prompt = prompt_agent.extract_pattern_prompt().strip()
        print(f"[API] 提示词: {prompt}")

        image_url = _gemini_edit_to_local_url(prompt=prompt, image_base64s=[image_b64])
        return jsonify({"success": True, "image_url": image_url, "method": "Gemini 3 Pro"})
            
    except Exception as e:
        error_msg = f"提取异常: {str(e)}"
        print(f"[API] ❌ {error_msg}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": error_msg}), 500


@app.route('/api/replace-text', methods=['POST'])
def replace_text():
    """文字替换 - Gemini 3 Pro"""
    print(f"\n[API] ========== 文字替换请求 ==========")
    
    if 'image' not in request.files:
        return jsonify({"success": False, "error": "未上传图片"}), 400
    
    file = request.files['image']
    instruction = request.form.get('instruction', '')
    
    if not instruction:
        return jsonify({"success": False, "error": "未提供替换指令"}), 400
    
    print(f"[API] 文件: {file.filename}")
    print(f"[API] 指令: {instruction}")
    
    try:
        image_b64 = _file_to_base64(file)
        prompt = prompt_agent.replace_text_prompt(instruction)
        print(f"[API] 提示词: {prompt}")

        image_url = _gemini_edit_to_local_url(prompt=prompt, image_base64s=[image_b64])
        return jsonify({"success": True, "image_url": image_url})
            
    except Exception as e:
        print(f"[API] ❌ 异常: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/replace-background', methods=['POST'])
def replace_background():
    """背景替换 - Gemini 3 Pro（支持细致要求）"""
    print(f"\n[API] ========== 背景替换请求 ==========")
    
    if 'subject_image' not in request.files:
        return jsonify({"success": False, "error": "未上传主体图片"}), 400
    
    if 'background_image' not in request.files:
        return jsonify({"success": False, "error": "未上传背景图片"}), 400
        
    subject_file = request.files['subject_image']
    background_file = request.files['background_image']
    instruction = request.form.get('instruction', '').strip()
    keep_logo = request.form.get('keep_logo', 'yes')  # 默认保留logo
    keep_text = request.form.get('keep_text', 'yes')  # 默认保留文案
    
    print(f"[API] 主体图: {subject_file.filename}")
    print(f"[API] 背景图: {background_file.filename}")
    print(f"[API] 保留Logo: {keep_logo}")
    print(f"[API] 保留文案: {keep_text}")
    if instruction:
        print(f"[API] 用户要求: {instruction}")
    else:
        print(f"[API] 无特殊要求，直接替换背景")
    
    try:
        subject_b64 = _file_to_base64(subject_file)
        bg_b64 = _file_to_base64(background_file)

        # 图片顺序：产品图在前，背景图在后
        # 与提示词描述一致：第一张是产品图，第二张是背景图
        image_base64s = [subject_b64, bg_b64]

        # 使用带细致要求的prompt（包含快捷选项）
        prompt = prompt_agent.replace_background_with_instruction_prompt(
            instruction=instruction,
            keep_logo=keep_logo,
            keep_text=keep_text
        )
        print(f"[API] 提示词: {prompt}")

        image_url = _gemini_edit_to_local_url(prompt=prompt, image_base64s=image_base64s)
        return jsonify({"success": True, "image_url": image_url})
            
    except Exception as e:
        error_msg = f"异常: {str(e)}"
        print(f"[API] ❌ {error_msg}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": error_msg}), 500


@app.route('/api/resize-image', methods=['POST'])
def resize_image_route():
    """尺寸修改 (裁剪/比例)"""
    print(f"\n[API] ========== 尺寸修改请求 ==========")
    
    try:
        # 检查文件上传
        if 'image' not in request.files:
            print(f"[API] ❌ 错误: 未上传图片")
            return jsonify({"success": False, "error": "未上传图片"}), 400
        
        file = request.files['image']
        if not file or file.filename == '':
            print(f"[API] ❌ 错误: 文件名为空")
            return jsonify({"success": False, "error": "请选择有效的图片文件"}), 400
        
        print(f"[API] 文件名: {file.filename}")
        print(f"[API] 文件大小: {file.content_length} bytes" if hasattr(file, 'content_length') else "[API] 文件大小: 未知")
        
        # 裁剪参数
        crop_x = request.form.get('x', type=int)
        crop_y = request.form.get('y', type=int)
        crop_w = request.form.get('w', type=int)
        crop_h = request.form.get('h', type=int)
        
        # 比例参数 (如果未裁剪)
        target_ratio = request.form.get('ratio') # "1:1", "4:3" etc.
        
        # 自定义尺寸参数
        target_width = request.form.get('target_width', type=int)
        target_height = request.form.get('target_height', type=int)
        
        print(f"[API] 裁剪参数: x={crop_x}, y={crop_y}, w={crop_w}, h={crop_h}")
        print(f"[API] 比例参数: {target_ratio}")
        print(f"[API] 自定义尺寸: {target_width}x{target_height}" if target_width and target_height else "[API] 自定义尺寸: 未设置")
        
        # 读取图片
        try:
            image_bytes = file.read()
            if not image_bytes:
                print(f"[API] ❌ 错误: 图片文件为空")
                return jsonify({"success": False, "error": "图片文件为空，请重新上传"}), 400
            
            print(f"[API] ✓ 图片读取成功，大小: {len(image_bytes)} bytes")
        except Exception as e:
            print(f"[API] ❌ 读取图片失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({"success": False, "error": f"读取图片失败: {str(e)}"}), 400
        
        # 1. 如果有裁剪参数，先裁剪
        if crop_w and crop_h:
            try:
                print(f"[API] 开始裁剪图片...")
                image_bytes = image_processing.crop_image(image_bytes, crop_x, crop_y, crop_w, crop_h)
                print(f"[API] ✓ 裁剪完成，新大小: {len(image_bytes)} bytes")
            except Exception as e:
                print(f"[API] ❌ 裁剪失败: {str(e)}")
                import traceback
                traceback.print_exc()
                return jsonify({"success": False, "error": f"裁剪失败: {str(e)}"}), 400
        # 2. 如果有比例参数且未裁剪，自动中心裁剪到比例
        elif target_ratio and target_ratio != 'custom':
            try:
                print(f"[API] 开始按比例裁剪: {target_ratio}")
                image_bytes = image_processing.crop_to_ratio(image_bytes, target_ratio)
                print(f"[API] ✓ 比例裁剪完成，新大小: {len(image_bytes)} bytes")
            except Exception as e:
                print(f"[API] ❌ 比例裁剪失败: {str(e)}")
                import traceback
                traceback.print_exc()
                return jsonify({"success": False, "error": f"比例裁剪失败: {str(e)}"}), 400
        
        # 3. 如果指定了自定义尺寸，调整到目标尺寸
        if target_width and target_height:
            try:
                print(f"[API] 开始调整到目标尺寸: {target_width}x{target_height}")
                image_bytes = image_processing.resize_to_dimensions(image_bytes, target_width, target_height)
                print(f"[API] ✓ 尺寸调整完成，新大小: {len(image_bytes)} bytes")
            except Exception as e:
                print(f"[API] ❌ 尺寸调整失败: {str(e)}")
                import traceback
                traceback.print_exc()
                return jsonify({"success": False, "error": f"尺寸调整失败: {str(e)}"}), 400
        
        # 保存结果
        filename = f"resized_{secure_filename(file.filename)}"
        print(f"[API] 准备保存文件: {filename}")
        
        try:
            if USE_LOCAL_STORAGE:
                print(f"[API] 使用本地存储")
                result = local_storage.save_image(image_bytes, filename)
            else:
                print(f"[API] 上传到图床 (大小: {len(image_bytes)} bytes)...")
                result = image_uploader.upload(image_bytes, filename)
                print(f"[API] 图床上传结果: {result}")
            
            if result.get('success'):
                print(f"[API] ✓ 保存成功: {result.get('url', 'N/A')}")
                return jsonify({"success": True, "image_url": result['url']})
            else:
                error_msg = result.get('error', '未知错误')
                print(f"[API] ❌ 保存失败: {error_msg}")
                return jsonify({"success": False, "error": error_msg}), 400
                
        except Exception as e:
            error_msg = str(e)
            print(f"[API] ❌ 保存/上传异常: {error_msg}")
            import traceback
            traceback.print_exc()
            
            # 检查是否是超时错误
            if 'timeout' in error_msg.lower() or 'timed out' in error_msg.lower():
                return jsonify({
                    "success": False, 
                    "error": "上传超时，图片可能过大。请尝试压缩图片后重试，或使用本地存储模式。"
                }), 400
            
            return jsonify({"success": False, "error": f"保存失败: {error_msg}"}), 500
            
    except Exception as e:
        error_msg = str(e)
        print(f"[API] ❌ 未预期的异常: {error_msg}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": f"处理失败: {error_msg}"}), 500


@app.route('/api/expand-image', methods=['POST'])
def expand_image():
    """一键智能扩图 - 自动补全不完整图片"""
    print(f"\n[API] ========== 智能扩图请求 ==========")
    
    if 'image' not in request.files:
        return jsonify({"success": False, "error": "未上传图片"}), 400
        
    file = request.files['image']
    
    try:
        image_bytes = file.read()
        # 使用固定的智能扩充比例 1.5x，适合补全大多数被裁剪的图片
        ratio = 1.5
        print(f"[API] 使用智能扩充比例: {ratio}x")
        
        padded_bytes = image_processing.expand_image(image_bytes, ratio=ratio)
        padded_b64 = _bytes_to_base64(padded_bytes)

        prompt = prompt_agent.expand_image_prompt()
        print(f"[API] 提示词: {prompt}")

        image_url = _gemini_edit_to_local_url(prompt=prompt, image_base64s=[padded_b64])
        return jsonify({"success": True, "image_url": image_url})
            
    except Exception as e:
        print(f"[API] ❌ 异常: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/logo-add', methods=['POST'])
def logo_add():
    """Logo添加/合成"""
    print(f"\n[API] ========== Logo添加请求 ==========")
    
    # 检查是否是新的合成图模式
    if 'composite_image' in request.files:
        print("[API] 检测到合成图，进行自然融合...")
        file = request.files['composite_image']
        try:
            # 获取原图尺寸
            file.seek(0)
            img = Image.open(io.BytesIO(file.read()))
            original_width, original_height = img.size
            print(f"[API] 原图尺寸: {original_width}x{original_height}")
            
            # 重置文件指针
            file.seek(0)
            image_b64 = _file_to_base64(file)
            
            # 在提示词中明确说明原始尺寸
            prompt = f"{prompt_agent.logo_fusion_prompt()}\n\n原图尺寸: {original_width}x{original_height} 像素，输出必须保持此尺寸。"

            # 使用新函数，确保输出尺寸与原图一致
            image_url = _gemini_edit_to_local_url_with_resize(
                prompt=prompt, 
                image_base64s=[image_b64],
                target_width=original_width,
                target_height=original_height,
                size="1K"
            )
            return jsonify({"success": True, "image_url": image_url})
                
        except Exception as e:
            print(f"[API] ❌ 处理失败: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({"success": False, "error": str(e)}), 500

    # 旧模式（保留兼容性，或者报错）
    if 'base_image' not in request.files or 'logo_image' not in request.files:
        return jsonify({"success": False, "error": "需上传底图和Logo"}), 400
        
    base = request.files['base_image']
    logo = request.files['logo_image']
    
    try:
        # 获取基础图片的原始尺寸
        base.seek(0)
        base_img = Image.open(io.BytesIO(base.read()))
        original_width, original_height = base_img.size
        print(f"[API] 基础图片尺寸: {original_width}x{original_height}")
        
        # 重置文件指针
        base.seek(0)
        base_b64 = _file_to_base64(base)
        logo_b64 = _file_to_base64(logo)

        # 在提示词中明确说明原始尺寸
        prompt = f"{prompt_agent.logo_add_prompt()}\n\n基础图片原始尺寸: {original_width}x{original_height} 像素，输出必须保持此尺寸。"
        print(f"[API] 提示词: {prompt[:200]}...")

        # 使用新函数，确保输出尺寸与原图一致
        image_url = _gemini_edit_to_local_url_with_resize(
            prompt=prompt,
            image_base64s=[base_b64, logo_b64],
            target_width=original_width,
            target_height=original_height,
            size="1K"
        )
        return jsonify({"success": True, "image_url": image_url})
            
    except Exception as e:
        print(f"[API] ❌ 处理失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ==========================================
# 文字编辑功能 API
# ==========================================

@app.route('/api/text-recognition', methods=['POST'])
def text_recognition():
    """文字识别接口 - 使用 PaddleOCR"""
    print(f"\n[API] ========== OCR 文字识别请求 ==========")
    
    try:
        if 'image' not in request.files:
            return jsonify({"success": False, "error": "请上传图片"}), 400
        
        image_file = request.files['image']
        print(f"[OCR] 收到图片: {image_file.filename}")
        
        # 读取图片 bytes
        image_bytes = image_file.read()
        print(f"[OCR] 图片大小: {len(image_bytes)} bytes")
        
        # 执行 OCR
        ocr_service = get_ocr_service()
        text_regions = ocr_service.recognize(image_bytes)
        
        print(f"[OCR] ✅ 识别完成，共 {len(text_regions)} 个文字区域")
        for idx, region in enumerate(text_regions[:3]):  # 只打印前3个
            print(f"[OCR]   区域{idx+1}: {region['text']} (置信度: {region['confidence']:.2f})")
        
        return jsonify({
            "success": True,
            "textRegions": text_regions
        })
        
    except Exception as e:
        print(f"[OCR] ❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False, 
            "error": f"OCR 识别失败: {str(e)}"
        }), 500


@app.route('/api/text-inpainting', methods=['POST'])
def text_inpainting():
    """文字去除（Inpainting）- 移除指定区域的文字并智能填充背景"""
    print(f"\n[API] ========== 文字去除请求 ==========")
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"success": False, "error": "未接收到数据"}), 400
        
        image_url = data.get('image')
        region = data.get('region')  # {x, y, width, height}
        
        if not region:
            return jsonify({"success": False, "error": "未指定去除区域"}), 400
        
        print(f"[API] 原图: {image_url[:50] if image_url else 'None'}...")
        print(f"[API] 去除区域: x={region['x']}, y={region['y']}, w={region['width']}, h={region['height']}")
        
        # 获取原图
        if image_url.startswith('data:image'):
            # Base64 格式
            image_b64 = image_url.split(',')[1]
        elif image_url.startswith('/uploads/'):
            # 本地文件
            file_path = os.path.join(app.static_folder, image_url[1:])
            with open(file_path, 'rb') as f:
                image_bytes = f.read()
            image_b64 = _bytes_to_base64(image_bytes)
        else:
            # URL
            proxies = {'http': None, 'https': None}
            resp = requests.get(image_url, proxies=proxies)
            image_b64 = _bytes_to_base64(resp.content)
        
        # 生成文字去除提示词
        prompt = prompt_agent.text_inpainting_prompt(
            x=int(region['x']),
            y=int(region['y']),
            width=int(region['width']),
            height=int(region['height'])
        )
        print(f"[API] 提示词: {prompt[:150]}...")
        
        # 调用 Gemini API
        result_url = _gemini_edit_to_local_url(
            prompt=prompt,
            image_base64s=[image_b64],
            size="1K"
        )
        
        print(f"[API] ✅ 文字去除完成: {result_url}")
        
        return jsonify({
            "success": True,
            "image_url": result_url
        })
        
    except Exception as e:
        print(f"[API] ❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"文字去除失败: {str(e)}"
        }), 500


@app.route('/api/apply-text-edits', methods=['POST'])
def apply_text_edits():
    """应用文字编辑 - AI融合（增强位置约束）"""
    print(f"\n[API] ========== 应用文字编辑请求 ==========")
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"success": False, "error": "未接收到数据"}), 400
        
        image_url = data.get('image')
        edits = data.get('edits', [])
        insertions = data.get('insertions', [])
        image_dimensions = data.get('dimensions', {})  # 获取图片尺寸信息
        
        print(f"[API] 原图: {image_url[:50]}...")
        print(f"[API] 编辑数量: {len(edits)}")
        print(f"[API] 插入数量: {len(insertions)}")
        if image_dimensions:
            print(f"[API] 图片尺寸: {image_dimensions.get('width')}x{image_dimensions.get('height')}")
        
        # 获取原图尺寸（如果前端没有提供）
        if not image_dimensions or 'width' not in image_dimensions:
            if image_url.startswith('/uploads/'):
                file_path = os.path.join(app.static_folder, image_url[1:])
                with Image.open(file_path) as img:
                    image_dimensions = {'width': img.width, 'height': img.height}
            elif image_url.startswith('data:image'):
                image_data = image_url.split(',')[1]
                image_bytes = base64.b64decode(image_data)
                with Image.open(io.BytesIO(image_bytes)) as img:
                    image_dimensions = {'width': img.width, 'height': img.height}
            else:
                image_dimensions = {'width': 0, 'height': 0}
        
        img_width = image_dimensions.get('width', 0)
        img_height = image_dimensions.get('height', 0)
        
        # 构建增强的 prompt，包含像素级精确位置
        prompt_parts = []
        prompt_parts.append("[CRITICAL INSTRUCTION] This is a precise text editing task. You MUST follow the exact pixel coordinates provided.")
        prompt_parts.append(f"\n[IMAGE DIMENSIONS] Width: {img_width}px, Height: {img_height}px")
        prompt_parts.append("\n" + "="*80)
        
        if edits:
            prompt_parts.append("\n[TEXT REPLACEMENTS - EXACT POSITION REQUIRED]")
            prompt_parts.append("For each item, the text MUST be placed at the EXACT coordinates specified:")
            
            for idx, edit in enumerate(edits):
                x, y = edit['x'], edit['y']
                width, height = edit['width'], edit['height']
                
                # 计算相对位置（百分比），提供双重约束
                rel_x = (x / img_width * 100) if img_width > 0 else 0
                rel_y = (y / img_height * 100) if img_height > 0 else 0
                
                prompt_parts.append(f"\n[{idx+1}] Text Edit:")
                prompt_parts.append(f"   📍 ABSOLUTE POSITION: Top-left corner at pixel ({x}, {y})")
                prompt_parts.append(f"   📍 RELATIVE POSITION: {rel_x:.1f}% from left, {rel_y:.1f}% from top")
                prompt_parts.append(f"   📐 EXACT SIZE: {width}px × {height}px")
                prompt_parts.append(f"   📝 NEW TEXT: \"{edit['content']}\"")
                
                if 'styles' in edit:
                    styles = edit['styles']
                    prompt_parts.append(f"   🎨 STYLE:")
                    prompt_parts.append(f"      - Font Family: {styles.get('fontFamily', 'sans-serif')}")
                    prompt_parts.append(f"      - Font Size: {styles.get('fontSize', 16)}px")
                    prompt_parts.append(f"      - Text Color: {styles.get('color', '#000000')}")
                    prompt_parts.append(f"      - Text Align: {styles.get('align', 'left')}")
                    if styles.get('charSpacing'):
                        prompt_parts.append(f"      - Letter Spacing: {styles.get('charSpacing')}px")
                    if styles.get('lineHeight'):
                        prompt_parts.append(f"      - Line Height: {styles.get('lineHeight')}")
                
                # 添加严格的位置约束说明
                prompt_parts.append(f"   ⚠️  CRITICAL: The text \"{edit['content']}\" MUST start at pixel ({x}, {y}). Do NOT move it to any other position.")
        
        if insertions:
            prompt_parts.append("\n\n[TEXT INSERTIONS - EXACT POSITION REQUIRED]")
            prompt_parts.append("Insert new elements at the EXACT coordinates specified:")
            
            for idx, insertion in enumerate(insertions):
                if insertion['type'] == 'text':
                    x, y = insertion['x'], insertion['y']
                    
                    # 计算相对位置
                    rel_x = (x / img_width * 100) if img_width > 0 else 0
                    rel_y = (y / img_height * 100) if img_height > 0 else 0
                    
                    prompt_parts.append(f"\n[{idx+1}] Text Insertion:")
                    prompt_parts.append(f"   📍 ABSOLUTE POSITION: Top-left at pixel ({x}, {y})")
                    prompt_parts.append(f"   📍 RELATIVE POSITION: {rel_x:.1f}% from left, {rel_y:.1f}% from top")
                    prompt_parts.append(f"   📝 TEXT CONTENT: \"{insertion['content']}\"")
                    
                    if 'styles' in insertion:
                        styles = insertion['styles']
                        prompt_parts.append(f"   🎨 STYLE:")
                        prompt_parts.append(f"      - Font: {styles.get('fontFamily', 'sans-serif')}")
                        prompt_parts.append(f"      - Size: {styles.get('fontSize', 16)}px")
                        prompt_parts.append(f"      - Color: {styles.get('color', '#000000')}")
                        prompt_parts.append(f"      - Align: {styles.get('align', 'left')}")
                    
                    prompt_parts.append(f"   ⚠️  CRITICAL: Place this text EXACTLY at pixel ({x}, {y}).")
                
                elif insertion['type'] == 'image':
                    x, y = insertion['x'], insertion['y']
                    width, height = insertion['width'], insertion['height']
                    
                    prompt_parts.append(f"\n[{idx+1}] Image Insertion:")
                    prompt_parts.append(f"   📍 POSITION: Top-left at ({x}, {y})")
                    prompt_parts.append(f"   📐 SIZE: {width}px × {height}px")
        
        prompt_parts.append("\n" + "="*80)
        prompt_parts.append("\n[FINAL REQUIREMENTS]")
        prompt_parts.append("✓ Use EXACT pixel coordinates provided - DO NOT approximate or estimate")
        prompt_parts.append("✓ Maintain the EXACT font sizes and styles specified")
        prompt_parts.append("✓ Keep text alignment as specified (left/center/right)")
        prompt_parts.append("✓ Preserve the original image dimensions and quality")
        prompt_parts.append("✓ Blend text naturally with proper anti-aliasing and shadows")
        prompt_parts.append("✓ Match the lighting and perspective of the original image")
        prompt_parts.append("\n⚠️  POSITION ACCURACY IS CRITICAL - Do not deviate from specified coordinates!")
        
        prompt = "".join(prompt_parts)
        print(f"[API] 增强提示词长度: {len(prompt)} 字符")
        print(f"[API] 提示词预览: {prompt[:300]}...")
        
        # 获取原图
        if image_url.startswith('data:image'):
            # Base64 格式
            image_b64 = image_url.split(',')[1]
        elif image_url.startswith('/uploads/'):
            # 本地文件
            file_path = os.path.join(app.static_folder, image_url[1:])
            with open(file_path, 'rb') as f:
                image_bytes = f.read()
            image_b64 = _bytes_to_base64(image_bytes)
        else:
            # URL
            proxies = {'http': None, 'https': None}
            resp = requests.get(image_url, proxies=proxies)
            image_b64 = _bytes_to_base64(resp.content)
        
        # 调用 Gemini API
        result_url = _gemini_edit_to_local_url(
            prompt=prompt,
            image_base64s=[image_b64],
            size="1K"
        )
        
        print(f"[API] ✅ AI融合完成: {result_url}")
        
        return jsonify({
            "success": True,
            "image_url": result_url
        })
        
    except Exception as e:
        print(f"[API] ❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"应用编辑失败: {str(e)}"
        }), 500


# ==========================================
# 测试路由
# ==========================================
@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({
        "status": "ok",
        "message": "Gemini 3 Pro API 服务器",
        "model": "Gemini 3 Pro (Image Edit)",
        "endpoints": [
            "/api/remove-defects",
            "/api/upscale",
            "/api/extract-pattern",
            "/api/replace-text",
            "/api/replace-background",
            "/api/download-image",
            "/api/set-gemini-key",
            "/api/text-recognition",
            "/api/text-inpainting",
            "/api/apply-text-edits"
        ]
    })


@app.route('/api/set-gemini-key', methods=['POST'])
def set_gemini_key():
    global gemini3_client
    key = None
    if request.is_json:
        data = request.get_json(silent=True) or {}
        key = (data.get("api_key") or "").strip()
    else:
        key = (request.form.get("api_key", "")).strip()

    if not key:
        return jsonify({"success": False, "error": "缺少 api_key"}), 400

    try:
        gemini3_client = Gemini3ProClient(api_key=key)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


# ==========================================
# 图片下载代理（解决跨域下载和 Content-Disposition 问题）
# ==========================================
@app.route('/api/download-image', methods=['POST'])
def download_image():
    """
    前端传入图片 URL，由后端拉取后以附件形式返回，保证浏览器弹出下载。
    这样可以避免第三方图床的跨域和 Content-Disposition 限制。
    """
    try:
        data = request.get_json(silent=True) or {}
        image_url = data.get('url')
        if not image_url:
            return jsonify({"success": False, "error": "缺少图片 URL"}), 400

        if image_url.startswith("/uploads/"):
            filename = image_url.split("/uploads/", 1)[1]
            file_path = os.path.join(app.static_folder, "uploads", filename)
            if not os.path.exists(file_path):
                return jsonify({"success": False, "error": "本地图片不存在"}), 404

            ext = os.path.splitext(filename)[1].lower()
            content_type = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
            }.get(ext, "application/octet-stream")

            with open(file_path, "rb") as f:
                content = f.read()

            return Response(
                content,
                mimetype=content_type,
                headers={
                    "Content-Disposition": "attachment; filename=ai_image" + ext
                }
            )

        # 向图床请求图片数据（禁用代理）
        proxies = {'http': None, 'https': None}
        resp = requests.get(image_url, timeout=30, proxies=proxies)
        if resp.status_code != 200:
            return jsonify({
                "success": False,
                "error": f"拉取图片失败，状态码 {resp.status_code}"
            }), 502

        content_type = resp.headers.get('Content-Type', 'image/png')

        # 统一以附件形式返回，文件名可根据需要调整
        return Response(
            resp.content,
            mimetype=content_type,
            headers={
                "Content-Disposition": f"attachment; filename=ai_image.png"
            }
        )
    except Exception as e:
        print(f"[API] ❌ 下载代理异常: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

# ==========================================
# 批量处理 API
# ==========================================

@app.route('/api/batch-progress/<task_id>', methods=['GET'])
def get_batch_progress(task_id):
    """获取批量处理进度"""
    if task_id in batch_progress:
        return jsonify(batch_progress[task_id])
    else:
        return jsonify({"error": "任务不存在"}), 404

@app.route('/api/batch-replace-background', methods=['POST'])
def batch_replace_background():
    """批量背景替换 - 逐张处理"""
    print(f"\n[API] ========== 批量背景替换请求 ==========")
    
    # 接收文件
    source_files = request.files.getlist('source_images')
    background_file = request.files.get('background_image')
    
    # 验证
    if not source_files or not background_file:
        return jsonify({"success": False, "error": "请上传完整的图片"}), 400
    
    if len(source_files) > 8:
        return jsonify({"success": False, "error": "最多上传8张图片"}), 400
    
    # 生成任务ID
    task_id = uuid.uuid4().hex
    print(f"[API] 任务ID: {task_id}")
    print(f"[API] 收到 {len(source_files)} 张原图和 1 张背景图")
    
    # 初始化进度
    batch_progress[task_id] = {
        "status": "processing",
        "total": len(source_files),
        "current": 0,
        "succeeded": 0,
        "failed": 0,
        "results": []
    }
    
    try:
        # 获取背景图尺寸和 base64
        background_file.seek(0)
        bg_img = Image.open(io.BytesIO(background_file.read()))
        bg_width, bg_height = bg_img.size
        print(f"[API] 背景图尺寸: {bg_width}x{bg_height}")
        
        background_file.seek(0)
        bg_base64 = _file_to_base64(background_file)
        
        # 获取所有原图的 base64 和尺寸
        source_base64s = []
        source_sizes = []
        
        for idx, source_file in enumerate(source_files):
            source_file.seek(0)
            source_img = Image.open(io.BytesIO(source_file.read()))
            source_width, source_height = source_img.size
            source_sizes.append((source_width, source_height))
            print(f"[API] 原图{idx+1}尺寸: {source_width}x{source_height}")
            
            source_file.seek(0)
            source_base64s.append(_file_to_base64(source_file))
        
        # 策略B：逐张处理（更可靠，进度更清晰）
        print(f"[API] 开始逐张处理 {len(source_files)} 张图片...")
        
        results = []
        
        # 逐张处理每个原图
        for idx, (source_base64, source_size) in enumerate(zip(source_base64s, source_sizes)):
            try:
                # 更新进度
                batch_progress[task_id]["current"] = idx + 1
                print(f"[API] 正在处理第 {idx+1}/{len(source_files)} 张图片...")
                
                # 构建提示词（每张图片独立生成，保证质量）
                prompt = prompt_agent.replace_background_with_instruction_prompt(
                    instruction="将第一张图片（背景图）的背景替换到第二张图片（产品图）的背景上。保持产品图中的产品主体、logo和文字不变。替换要自然融合。",
                    keep_logo='yes',
                    keep_text='yes'
                )
                
                # 每次只传入背景图 + 当前原图
                api_result = gemini3_client.edit_image(
                    prompt=prompt,
                    image_base64s=[bg_base64, source_base64],
                    size="1K"
                )
                
                print(f"[API] 图片{idx+1} API 返回: {str(api_result)[:100]}...")
                
                # 提取图片 URL 或 base64
                image_bytes = None
                
                # 方法1: 尝试从响应字典中获取 image_urls
                if isinstance(api_result, dict) and 'image_urls' in api_result:
                    urls = api_result['image_urls']
                    if urls and len(urls) > 0:
                        # 下载图片
                        proxies = {'http': None, 'https': None}
                        img_response = requests.get(urls[0], timeout=60, proxies=proxies)
                        if img_response.status_code == 200:
                            image_bytes = img_response.content
                            print(f"[API] 图片{idx+1} 从 URL 下载成功")
                
                # 方法2: 如果没有 URL，尝试提取 URL 字符串
                if not image_bytes:
                    import re
                    def _collect_strings(obj, depth=0):
                        if depth > 10:
                            return
                        if isinstance(obj, str):
                            yield obj
                        elif isinstance(obj, dict):
                            for v in obj.values():
                                yield from _collect_strings(v, depth + 1)
                        elif isinstance(obj, (list, tuple)):
                            for item in obj:
                                yield from _collect_strings(item, depth + 1)
                    
                    strings = list(_collect_strings(api_result))
                    url_re = re.compile(r"https?://[^\s\"'<>]+")
                    for s in strings:
                        for u in url_re.findall(s):
                            url = u.rstrip(")]}>.,\"")
                            try:
                                proxies = {'http': None, 'https': None}
                                img_response = requests.get(url, timeout=60, proxies=proxies)
                                if img_response.status_code == 200 and img_response.content:
                                    image_bytes = img_response.content
                                    print(f"[API] 图片{idx+1} 从提取的 URL 下载成功")
                                    break
                            except:
                                continue
                        if image_bytes:
                            break
                
                # 方法3: 尝试 base64
                if not image_bytes:
                    for s in strings:
                        if s.startswith("data:image/") and ";base64," in s:
                            b64_data = s.split(";base64,", 1)[1]
                            image_bytes = base64.b64decode(b64_data, validate=False)
                            print(f"[API] 图片{idx+1} 从 base64 提取成功")
                            break
                        elif len(s) > 512 and re.fullmatch(r"[A-Za-z0-9+/=\s]+", s or ""):
                            try:
                                image_bytes = base64.b64decode(s.strip(), validate=False)
                                print(f"[API] 图片{idx+1} 从纯 base64 提取成功")
                                break
                            except:
                                continue
                
                if not image_bytes:
                    raise Exception("无法从 API 响应中提取图片数据")
                
                # 调整到原图尺寸
                target_width, target_height = source_size
                image_bytes = image_processing.resize_to_dimensions(
                    image_bytes,
                    target_width,
                    target_height,
                    maintain_quality=True
                )
                
                # 保存到本地
                output_dir = os.path.join(app.static_folder, "uploads")
                os.makedirs(output_dir, exist_ok=True)
                
                filename = f"batch_bg_{uuid.uuid4().hex}.png"
                file_path = os.path.join(output_dir, filename)
                
                with open(file_path, 'wb') as f:
                    f.write(image_bytes)
                
                result_item = {
                    "success": True,
                    "index": idx,
                    "url": f"/uploads/{filename}",
                    "filename": filename
                }
                results.append(result_item)
                
                # 更新进度
                batch_progress[task_id]["succeeded"] += 1
                batch_progress[task_id]["results"].append(result_item)
                
                print(f"[API] ✅ 图片{idx+1} 处理成功: {filename}")
                
            except Exception as e:
                print(f"[API] ❌ 图片{idx+1} 处理失败: {e}")
                import traceback
                traceback.print_exc()
                
                result_item = {
                    "success": False,
                    "index": idx,
                    "error": str(e)
                }
                results.append(result_item)
                
                # 更新进度
                batch_progress[task_id]["failed"] += 1
                batch_progress[task_id]["results"].append(result_item)
        
        # 统计结果
        succeeded = len([r for r in results if r['success']])
        failed = len([r for r in results if not r['success']])
        
        # 标记任务完成
        batch_progress[task_id]["status"] = "completed"
        
        print(f"[API] 批量处理完成：成功 {succeeded}/{len(source_files)}")
        
        return jsonify({
            "success": True,
            "task_id": task_id,
            "total": len(source_files),
            "succeeded": succeeded,
            "failed": failed,
            "results": results
        })
        
    except Exception as e:
        print(f"[API] ❌ 批量背景替换失败: {e}")
        import traceback
        traceback.print_exc()
        
        # 标记任务失败
        if task_id in batch_progress:
            batch_progress[task_id]["status"] = "failed"
            batch_progress[task_id]["error"] = str(e)
        
        return jsonify({"success": False, "task_id": task_id, "error": str(e)}), 500


@app.route('/api/batch-product-migration', methods=['POST'])
def batch_product_migration():
    """批量产品迁移 - 逐张处理"""
    print(f"\n[API] ========== 批量产品迁移请求 ==========")
    
    # 接收文件
    source_files = request.files.getlist('source_images')
    target_file = request.files.get('target_image')
    
    # 验证
    if not source_files or not target_file:
        return jsonify({"success": False, "error": "请上传完整的图片"}), 400
    
    if len(source_files) > 8:
        return jsonify({"success": False, "error": "最多上传8张图片"}), 400
    
    # 生成任务ID
    task_id = uuid.uuid4().hex
    print(f"[API] 任务ID: {task_id}")
    print(f"[API] 收到 {len(source_files)} 张产品图和 1 张目标图")
    
    # 初始化进度
    batch_progress[task_id] = {
        "status": "processing",
        "total": len(source_files),
        "current": 0,
        "succeeded": 0,
        "failed": 0,
        "results": []
    }
    
    try:
        # 获取目标场景图尺寸和 base64
        target_file.seek(0)
        target_img = Image.open(io.BytesIO(target_file.read()))
        target_width, target_height = target_img.size
        print(f"[API] 目标场景图尺寸: {target_width}x{target_height}")
        
        target_file.seek(0)
        target_base64 = _file_to_base64(target_file)
        
        # 获取所有产品图的 base64
        source_base64s = []
        
        for idx, source_file in enumerate(source_files):
            source_file.seek(0)
            source_base64s.append(_file_to_base64(source_file))
        
        # 策略B：逐张处理（更可靠，进度更清晰）
        print(f"[API] 开始逐张迁移 {len(source_files)} 个产品...")
        
        results = []
        
        # 逐张处理每个产品图
        for idx, source_base64 in enumerate(source_base64s):
            try:
                # 更新进度
                batch_progress[task_id]["current"] = idx + 1
                print(f"[API] 正在迁移第 {idx+1}/{len(source_files)} 个产品...")
                
                # 构建提示词（每张图片独立生成）
                prompt = prompt_agent.product_migration_prompt()
                # 在提示词末尾强调尺寸约束
                prompt += f"\n\n[严格要求] 输出图片必须保持场景图的原始尺寸：{target_width}x{target_height}像素，不允许任何缩放或形变。"
                
                # 使用带尺寸调整的函数，确保输出尺寸与目标场景图一致
                image_bytes = gemini3_client.edit_image_to_bytes(
                    prompt=prompt,
                    image_base64s=[source_base64, target_base64],
                    size="1K"
                )
                
                # 检查并调整输出图片尺寸到目标场景图尺寸
                img = Image.open(io.BytesIO(image_bytes))
                generated_width, generated_height = img.size
                print(f"[API] 产品{idx+1} 生成图片尺寸: {generated_width}x{generated_height}")
                
                if generated_width != target_width or generated_height != target_height:
                    print(f"[API] 产品{idx+1} 调整图片尺寸到: {target_width}x{target_height}")
                    image_bytes = image_processing.resize_to_dimensions(
                        image_bytes,
                        target_width,
                        target_height,
                        maintain_quality=True
                    )
                else:
                    print(f"[API] 产品{idx+1} 尺寸已匹配，无需调整")
                
                # 跳过原来的 URL 提取逻辑，直接使用调整后的 image_bytes
                api_result = None  # 不再需要从 API 响应中提取
                
                # image_bytes 已经在上面通过 edit_image_to_bytes 获取并调整了尺寸
                
                # 保存到本地
                output_dir = os.path.join(app.static_folder, "uploads")
                os.makedirs(output_dir, exist_ok=True)
                
                filename = f"batch_mg_{uuid.uuid4().hex}.png"
                file_path = os.path.join(output_dir, filename)
                
                with open(file_path, 'wb') as f:
                    f.write(image_bytes)
                
                result_item = {
                    "success": True,
                    "index": idx,
                    "url": f"/uploads/{filename}",
                    "filename": filename
                }
                results.append(result_item)
                
                # 更新进度
                batch_progress[task_id]["succeeded"] += 1
                batch_progress[task_id]["results"].append(result_item)
                
                print(f"[API] ✅ 产品{idx+1} 迁移成功: {filename}")
                
            except Exception as e:
                print(f"[API] ❌ 产品{idx+1} 迁移失败: {e}")
                import traceback
                traceback.print_exc()
                
                result_item = {
                    "success": False,
                    "index": idx,
                    "error": str(e)
                }
                results.append(result_item)
                
                # 更新进度
                batch_progress[task_id]["failed"] += 1
                batch_progress[task_id]["results"].append(result_item)
        
        succeeded = len([r for r in results if r['success']])
        failed = len([r for r in results if not r['success']])
        
        # 标记任务完成
        batch_progress[task_id]["status"] = "completed"
        
        print(f"[API] 批量迁移完成：成功 {succeeded}/{len(source_files)}")
        
        return jsonify({
            "success": True,
            "task_id": task_id,
            "total": len(source_files),
            "succeeded": succeeded,
            "failed": failed,
            "results": results
        })
        
    except Exception as e:
        print(f"[API] ❌ 批量产品迁移失败: {e}")
        import traceback
        traceback.print_exc()
        
        # 标记任务失败
        if task_id in batch_progress:
            batch_progress[task_id]["status"] = "failed"
            batch_progress[task_id]["error"] = str(e)
        
        return jsonify({"success": False, "task_id": task_id, "error": str(e)}), 500


@app.route('/api/download-batch-zip', methods=['POST'])
def download_batch_zip():
    """打包下载批量处理结果为 ZIP"""
    import zipfile
    from io import BytesIO
    
    try:
        data = request.get_json()
        image_urls = data.get('urls', [])
        batch_name = data.get('name', 'batch_results')
        
        if not image_urls:
            return jsonify({"success": False, "error": "没有可下载的图片"}), 400
        
        print(f"[API] ========== 打包下载 ZIP ==========")
        print(f"[API] 打包 {len(image_urls)} 张图片")
        
        # 创建内存中的 ZIP
        zip_buffer = BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for idx, url in enumerate(image_urls):
                if url.startswith('/uploads/'):
                    file_path = os.path.join(app.static_folder, url[1:])
                    
                    if os.path.exists(file_path):
                        # 读取图片并添加到 ZIP
                        with open(file_path, 'rb') as f:
                            img_data = f.read()
                        
                        # 使用带序号的文件名
                        ext = os.path.splitext(file_path)[1]
                        filename = f"image_{idx+1:02d}{ext}"
                        zip_file.writestr(filename, img_data)
                        print(f"[API] 添加到 ZIP: {filename}")
        
        zip_buffer.seek(0)
        
        print(f"[API] ✅ ZIP 打包完成")
        
        return Response(
            zip_buffer.getvalue(),
            mimetype='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename={batch_name}.zip'
            }
        )
        
    except Exception as e:
        print(f"[API] ❌ ZIP 打包失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

# ==========================================
# 提供品牌字体文件访问
# ==========================================
@app.route('/fonts/<path:filename>')
def serve_fonts(filename):
    """提供品牌字体文件的访问"""
    fonts_dir = os.path.join(os.path.dirname(__file__), '品牌字体')
    file_path = os.path.join(fonts_dir, filename)
    
    if os.path.exists(file_path) and os.path.isfile(file_path):
        # 根据文件扩展名设置 MIME 类型
        if filename.endswith('.ttf'):
            mimetype = 'font/ttf'
        elif filename.endswith('.otf'):
            mimetype = 'font/otf'
        else:
            mimetype = 'application/octet-stream'
        
        return send_from_directory(fonts_dir, filename, mimetype=mimetype)
    else:
        return jsonify({"error": "字体文件未找到"}), 404

# ==========================================
# Logo编辑器 API
# ==========================================

# Logo素材库基础路径
LOGO_BASE_PATH = 'LOGO'

@app.route('/api/logo/styles', methods=['POST'])
def get_logo_styles():
    """获取平台下的款式列表"""
    try:
        data = request.json
        platform = data.get('platform', '')
        
        print(f"[Logo款式] 平台: {platform}")
        
        # 使用绝对路径
        platform_path = os.path.join(os.path.dirname(__file__), LOGO_BASE_PATH, platform)
        platform_path = os.path.abspath(platform_path)
        
        print(f"[Logo款式] 扫描路径: {platform_path}")
        print(f"[Logo款式] 路径存在: {os.path.exists(platform_path)}")
        
        if not os.path.exists(platform_path):
            return jsonify({
                'success': False,
                'error': f'平台路径不存在: {platform_path}'
            }), 404
        
        # 扫描款式文件夹
        styles = []
        try:
            items = os.listdir(platform_path)
            print(f"[Logo款式] 目录内容: {items}")
            for item in items:
                item_path = os.path.join(platform_path, item)
                if os.path.isdir(item_path):
                    styles.append(item)
                    print(f"[Logo款式] 找到款式文件夹: {item}")
        except Exception as e:
            print(f"[Logo款式] 扫描目录错误: {str(e)}")
            raise
        
        styles.sort()  # 排序
        
        print(f"[Logo款式] 找到 {len(styles)} 个款式: {styles}")
        
        return jsonify({
            'success': True,
            'styles': styles
        })
        
    except Exception as e:
        import traceback
        print(f"[Logo款式] 错误: {str(e)}")
        print(f"[Logo款式] 错误详情: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/logo/sizes', methods=['POST'])
def get_logo_sizes():
    """获取款式下的尺寸列表"""
    try:
        data = request.json
        platform = data.get('platform', '')
        style = data.get('style', '')
        
        print(f"[Logo尺寸] 平台: {platform}, 款式: {style}")
        
        # 使用绝对路径
        style_path = os.path.join(os.path.dirname(__file__), LOGO_BASE_PATH, platform, style)
        style_path = os.path.abspath(style_path)
        
        print(f"[Logo尺寸] 扫描路径: {style_path}")
        print(f"[Logo尺寸] 路径存在: {os.path.exists(style_path)}")
        
        if not os.path.exists(style_path):
            return jsonify({
                'success': False,
                'error': f'款式路径不存在: {style_path}'
            }), 404
        
        # 扫描尺寸文件夹
        sizes = []
        try:
            items = os.listdir(style_path)
            print(f"[Logo尺寸] 目录内容: {items}")
            for item in items:
                item_path = os.path.join(style_path, item)
                if os.path.isdir(item_path):
                    sizes.append(item)
                    print(f"[Logo尺寸] 找到尺寸文件夹: {item}")
        except Exception as e:
            print(f"[Logo尺寸] 扫描目录错误: {str(e)}")
            raise
        
        # 按照规格排序（800-800, 750-1000, 1024-1024, 1200-, 1440-1440）
        size_order = {'800-800': 1, '750-1000': 2, '1024-1024': 3, '1200-': 4, '1440-1440': 5}
        sizes.sort(key=lambda x: size_order.get(x, 999))
        
        print(f"[Logo尺寸] 找到 {len(sizes)} 个尺寸: {sizes}")
        
        return jsonify({
            'success': True,
            'sizes': sizes
        })
        
    except Exception as e:
        import traceback
        print(f"[Logo尺寸] 错误: {str(e)}")
        print(f"[Logo尺寸] 错误详情: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/logo/list', methods=['POST'])
def get_logo_list():
    """获取指定尺寸下的Logo文件列表"""
    try:
        data = request.json
        platform = data.get('platform', '')
        style = data.get('style', '')
        size = data.get('size', '')
        
        print(f"[Logo列表] 平台: {platform}, 款式: {style}, 尺寸: {size}")
        
        # 使用绝对路径
        logo_path = os.path.join(os.path.dirname(__file__), LOGO_BASE_PATH, platform, style, size)
        logo_path = os.path.abspath(logo_path)
        
        print(f"[Logo列表] 扫描路径: {logo_path}")
        print(f"[Logo列表] 路径存在: {os.path.exists(logo_path)}")
        
        if not os.path.exists(logo_path):
            return jsonify({
                'success': False,
                'error': f'Logo路径不存在: {logo_path}'
            }), 404
        
        # 扫描Logo文件
        logos = []
        logo_files = {}  # 用于去重（按颜色）
        
        for filename in os.listdir(logo_path):
            if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                # 解析文件名获取颜色信息
                # 例如: 800-A-白.png, 1200-C-黑.png, 800-E.png
                parts = filename.replace('.png', '').replace('.jpg', '').split('-')
                
                if len(parts) >= 3:
                    color = parts[2]  # 第三部分是颜色
                elif len(parts) == 2:
                    color = '默认'
                else:
                    color = '默认'
                
                # 记录文件路径（相对于LOGO文件夹）
                relative_path = os.path.join('LOGO', platform, style, size, filename).replace('\\', '/')
                
                logo_files[color] = {
                    'color': color,
                    'name': filename,
                    'path': relative_path
                }
        
        logos = list(logo_files.values())
        logos.sort(key=lambda x: x['color'])  # 按颜色排序
        
        print(f"[Logo列表] 找到 {len(logos)} 个Logo文件: {[l['name'] for l in logos]}")
        
        return jsonify({
            'success': True,
            'logos': logos
        })
        
    except Exception as e:
        print(f"[Logo列表] 错误: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/logo/compose', methods=['POST'])
def compose_logo():
    """合成Logo到图片上（使用原始高清Logo文件）"""
    try:
        data = request.json
        image_data = data.get('image', '')  # base64
        logo_path = data.get('logoPath', '')
        logo_size_percent = data.get('logoSize', 15)
        margin_x = data.get('marginX', 20)
        margin_y = data.get('marginY', 20)
        image_width = data.get('imageWidth', 800)
        image_height = data.get('imageHeight', 800)
        
        print(f"\n[Logo合成] ========== 开始处理 ==========")
        print(f"[Logo合成] 图片原始尺寸: {image_width}x{image_height}")
        print(f"[Logo合成] Logo路径: {logo_path}")
        print(f"[Logo合成] ⚠️ 使用原始高清Logo文件（不是缩略图）")
        print(f"[Logo合成] Logo尺寸设置: {logo_size_percent}%（基于图片宽度）")
        print(f"[Logo合成] 边距: X={margin_x}px, Y={margin_y}px")
        
        # 解析base64图片
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        base_image = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
        
        # 加载原始Logo文件
        # ⚠️ 重要：logo_path指向系统文件夹中的原始Logo文件（完整分辨率）
        # 例如：LOGO/天猫/普通款/800-800/800-A-白.png
        logo_full_path = os.path.join(os.path.dirname(__file__), logo_path)
        logo_full_path = os.path.abspath(logo_full_path)
        
        print(f"[Logo合成] Logo完整路径: {logo_full_path}")
        print(f"[Logo合成] Logo文件存在: {os.path.exists(logo_full_path)}")
        
        if not os.path.exists(logo_full_path):
            raise Exception(f"Logo文件不存在: {logo_full_path}")
        
        # 加载原始Logo图片（完整分辨率）
        logo_image = Image.open(logo_full_path).convert('RGBA')
        
        # 获取Logo在系统文件中的原始尺寸
        logo_original_width, logo_original_height = logo_image.size
        print(f"[Logo合成] Logo原始尺寸（系统文件）: {logo_original_width}x{logo_original_height}")
        
        # ⚠️ 关键计算：根据图片原始尺寸和Logo百分比计算目标尺寸
        # 例如：800x800图片，15%的Logo = 120x120像素
        # 这确保了在不同尺寸的图片上，Logo占比一致
        logo_width = int(image_width * (logo_size_percent / 100))
        # 保持Logo原始宽高比
        logo_height = int(logo_original_height * (logo_width / logo_original_width))
        
        print(f"[Logo合成] 计算后的Logo目标尺寸: {logo_width}x{logo_height}")
        print(f"[Logo合成] Logo占图片宽度的比例: {logo_size_percent}%")
        print(f"[Logo合成] Logo缩放比例: {logo_width/logo_original_width:.4f}x")
        
        # 使用高质量LANCZOS算法调整Logo尺寸
        # 这确保了Logo在缩放后仍然清晰
        logo_resized = logo_image.resize((logo_width, logo_height), Image.Resampling.LANCZOS)
        print(f"[Logo合成] Logo已调整到目标尺寸: {logo_resized.size[0]}x{logo_resized.size[1]}")
        
        # 合成Logo到图片上
        position = (int(margin_x), int(margin_y))
        print(f"[Logo合成] Logo放置位置: ({margin_x}, {margin_y})")
        base_image.paste(logo_resized, position, logo_resized)
        
        # 转回RGB格式（如果需要）
        if base_image.mode == 'RGBA':
            rgb_image = Image.new('RGB', base_image.size, (255, 255, 255))
            rgb_image.paste(base_image, mask=base_image.split()[3])
            base_image = rgb_image
        
        # 保存到内存（使用高质量设置）
        output = io.BytesIO()
        base_image.save(output, format='JPEG', quality=95)
        output.seek(0)
        
        # 转为base64返回
        result_base64 = 'data:image/jpeg;base64,' + base64.b64encode(output.read()).decode('utf-8')
        
        print(f"[Logo合成] ✓ 合成完成")
        print(f"[Logo合成] ========================================\n")
        
        return jsonify({
            'success': True,
            'result_url': result_base64
        })
        
    except Exception as e:
        import traceback
        print(f"[Logo合成] ❌ 错误: {str(e)}")
        print(f"[Logo合成] 错误详情: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/logo/export-zip', methods=['POST'])
def export_logo_zip():
    """导出为ZIP文件"""
    try:
        import zipfile
        from datetime import datetime
        from io import BytesIO
        
        data = request.json
        images = data.get('images', [])
        
        print(f"[ZIP导出] 开始打包 {len(images)} 张图片")
        
        # 使用内存中的ZIP文件，避免文件系统问题
        zip_buffer = BytesIO()
        
        # 创建ZIP
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for idx, img_data in enumerate(images):
                name = img_data.get('name', f'image_{idx + 1}.jpg')
                image_url = img_data.get('imageURL', '')
                
                # 解析base64
                if image_url.startswith('data:image'):
                    image_base64 = image_url.split(',')[1]
                    image_bytes = base64.b64decode(image_base64)
                    
                    # 添加到ZIP
                    zipf.writestr(name, image_bytes)
                    print(f"[ZIP导出] 添加: {name}")
                else:
                    # 如果是URL，尝试下载
                    try:
                        proxies = {'http': None, 'https': None}
                        resp = requests.get(image_url, timeout=30, proxies=proxies)
                        if resp.status_code == 200:
                            zipf.writestr(name, resp.content)
                            print(f"[ZIP导出] 添加: {name} (从URL下载)")
                    except Exception as e:
                        print(f"[ZIP导出] 警告: 无法下载图片 {name}: {e}")
        
        zip_buffer.seek(0)
        zip_filename = f"logo_images_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        
        print(f"[ZIP导出] ✓ 完成，文件: {zip_filename}")
        
        # 直接返回ZIP文件内容
        return Response(
            zip_buffer.getvalue(),
            mimetype='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename={zip_filename}'
            }
        )
        
    except Exception as e:
        import traceback
        print(f"[ZIP导出] ❌ 错误: {str(e)}")
        print(f"[ZIP导出] 错误详情: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==========================================
# 启动服务器
# ==========================================
if __name__ == '__main__':
    print("=" * 60)
    print("AI 图像处理助手 - 后端服务器")
    print("   使用 Gemini 3 Pro Image Edit 模型")
    print("=" * 60)
    print(f"服务器地址: http://localhost:5000")
    print(f"API 文档: http://localhost:5000/api/test")
    print("=" * 60)
    # 使用 use_reloader=False 避免 watchdog 兼容性问题
    # 启用 threaded=True 支持多线程并发（允许多人同时使用）
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False, threaded=True)
