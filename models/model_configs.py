# ==========================================
# 模型配置定义
# ==========================================
# 每个模型的可配置参数定义

# Gemini 3 Pro 模型配置
GEMINI_3_PRO_CONFIG = {
    "model_id": "gemini-3-pro",
    "model_name": "Gemini 3 Pro",
    "parameters": [
        {
            "name": "use_original_size_ratio",
            "label": "原图比例尺寸",
            "type": "switch",
            "default": False,
            "description": "开启后按原图比例和尺寸生成，关闭后可自定义比例和尺寸（优先级最高）"
        },
        {
            "name": "image_guidance",
            "label": "图像引导强度 (Image Guidance / 强度)",
            "type": "switch_number",
            "default": 0.5,
            "min": 0.1,
            "max": 0.9,
            "step": 0.1,
            "enabled_default": False,
            "description": "AI参考原图的程度。值越高(近1)越像原图，值越低(近0) AI越自由。0.1-0.3: 微调（换背景、调色）。0.4-0.6: 中度改造（改变材质、风格）。0.7-0.9: 重度参考（图生成精细）。"
        },
        {
            "name": "aspect_ratio",
            "label": "宽高比 (Aspect Ratio)",
            "type": "select",
            "default": "1:1",
            "options": [
                {"value": "original", "label": "原比例 (保持原图比例)"},
                {"value": "1:1", "label": "1:1 (正方形)"},
                {"value": "3:2", "label": "3:2"},
                {"value": "2:3", "label": "2:3"},
                {"value": "3:4", "label": "3:4"},
                {"value": "4:3", "label": "4:3"},
                {"value": "4:5", "label": "4:5"},
                {"value": "5:4", "label": "5:4"},
                {"value": "9:16", "label": "9:16 (竖版)"},
                {"value": "16:9", "label": "16:9 (横版)"},
                {"value": "21:9", "label": "21:9"}
            ],
            "description": "生成图片的宽高比（当'原图比例尺寸'关闭时可用）"
        },
        {
            "name": "size",
            "label": "图片尺寸 (Size)",
            "type": "select",
            "default": "1K",
            "options": [
                {"value": "original", "label": "原图尺寸 (保持原图大小)"},
                {"value": "1K", "label": "1K (快速)"},
                {"value": "2K", "label": "2K (平衡)"},
                {"value": "4K", "label": "4K (高质量)"}
            ],
            "description": "生成图片的尺寸档次（当'原图比例尺寸'关闭时可用）"
        }
    ]
}

# 导入 Jiekou 模型配置
from .jiekou_configs import JIEKOU_MODEL_CONFIGS

# 当前使用的模型配置
MODEL_CONFIGS = {
    "gemini-3-pro": GEMINI_3_PRO_CONFIG,
    **JIEKOU_MODEL_CONFIGS  # 合并所有 Jiekou 模型配置
}

def get_model_config(model_id):
    """获取指定模型的配置定义"""
    return MODEL_CONFIGS.get(model_id, None)

def get_default_config(model_id):
    """获取指定模型的默认配置值"""
    config = get_model_config(model_id)
    if not config or not config.get("parameters"):
        return {}
    
    default_values = {}
    for param in config["parameters"]:
        default_values[param["name"]] = param["default"]
    
    return default_values
