# ==========================================
# Jiekou.ai 模型配置定义
# ==========================================
# 每个模型的可配置参数定义

# FLUX.1 Kontext Dev 配置（文生图 + 图生图）
# 根据API文档，仅支持以下参数：prompt, images, fast_mode, size, num_inference_steps, guidance_scale, num_images, seed, output_format
FLUX_KONTEXT_DEV_CONFIG = {
    "model_id": "jiekou-flux-kontext-dev",
    "model_name": "FLUX.1 Kontext Dev",
    "category": "文生图 + 图生图",
    "parameters": [
        {
            "name": "fast_mode",
            "label": "极速模式 (Fast Mode)",
            "type": "switch",
            "default": False,
            "description": "开启后生成速度更快，但可能降低质量且价格更低"
        },
        {
            "name": "size",
            "label": "图片尺寸 (Size)",
            "type": "text",
            "default": "1024*1024",
            "description": "生成媒体的尺寸(像素,宽*高)。每个维度范围:[256~1536]。格式：宽*高，例如：1024*1024, 1536*1024, 1024*1536"
        },
        {
            "name": "num_inference_steps",
            "label": "推理步数 (Inference Steps)",
            "type": "number",
            "default": 28,
            "min": 1,
            "max": 50,
            "step": 1,
            "description": "推理步数。默认值为28。取值范围:[1~50]"
        },
        {
            "name": "guidance_scale",
            "label": "引导系数 (Guidance Scale)",
            "type": "number",
            "default": 2.5,
            "min": 1.0,
            "max": 20.0,
            "step": 0.1,
            "description": "引导系数，用于控制生成。默认值为2.5。取值范围:[1.0~20.0]"
        },
        {
            "name": "num_images",
            "label": "生成数量 (Num Images)",
            "type": "number",
            "default": 1,
            "min": 1,
            "max": 4,
            "step": 1,
            "description": "生成图像的数量。默认值为1。取值范围:[1~4]"
        },
        {
            "name": "seed",
            "label": "随机种子 (Seed)",
            "type": "number",
            "default": -1,
            "min": -1,
            "max": 2147483647,
            "step": 1,
            "description": "随机种子。默认值为-1，-1表示使用随机种子。取值范围:[-1~2147483647]"
        },
        {
            "name": "output_format",
            "label": "输出格式 (Output Format)",
            "type": "select",
            "default": "jpeg",
            "options": [
                {"value": "jpeg", "label": "JPEG"},
                {"value": "png", "label": "PNG"},
                {"value": "webp", "label": "WebP"}
            ],
            "description": "输出图像的格式。默认值为jpeg"
        }
    ]
}

# GPT 文生图配置
GPT_IMAGE_CONFIG = {
    "model_id": "jiekou-gpt-image",
    "model_name": "GPT 文生图",
    "category": "文生图",
    "parameters": [
        {
            "name": "model",
            "label": "模型版本 (Model)",
            "type": "select",
            "default": "gpt-image-1",
            "options": [
                {"value": "gpt-image-1", "label": "gpt-image-1"}
            ],
            "description": "GPT图像模型版本"
        },
        {
            "name": "quality",
            "label": "图片质量 (Quality)",
            "type": "select",
            "default": "auto",
            "options": [
                {"value": "auto", "label": "自动 (Auto)"},
                {"value": "high", "label": "高 (High)"},
                {"value": "medium", "label": "中 (Medium)"},
                {"value": "low", "label": "低 (Low)"}
            ],
            "description": "生成图片的质量等级"
        },
        {
            "name": "size",
            "label": "图片尺寸 (Size)",
            "type": "select",
            "default": "1024x1024",
            "options": [
                {"value": "1024x1024", "label": "1024×1024 (推荐)"},
                {"value": "1536x1024", "label": "1536×1024 (横版)"},
                {"value": "1024x1536", "label": "1024×1536 (竖版)"},
                {"value": "auto", "label": "自动 (Auto)"}
            ],
            "description": "生成图片的尺寸（API仅支持以上尺寸）"
        },
        {
            "name": "n",
            "label": "生成数量 (N)",
            "type": "number",
            "default": 1,
            "min": 1,
            "max": 10,
            "step": 1,
            "description": "生成图片的数量，取值范围为1-10"
        }
    ]
}

# Qwen-Image 图像编辑配置
QWEN_IMAGE_CONFIG = {
    "model_id": "jiekou-qwen-image",
    "model_name": "Qwen-Image 图像编辑",
    "category": "图生图",
    "parameters": [
        {
            "name": "seed",
            "label": "随机种子 (Seed)",
            "type": "number",
            "default": -1,
            "min": -1,
            "max": 2147483647,
            "step": 1,
            "description": "随机种子。-1表示将使用随机种子，范围: -1 ~ 2147483647"
        },
        {
            "name": "output_format",
            "label": "输出格式 (Output Format)",
            "type": "select",
            "default": "png",
            "options": [
                {"value": "png", "label": "PNG"},
                {"value": "jpeg", "label": "JPEG"},
                {"value": "webp", "label": "WebP"}
            ],
            "description": "输出图片格式"
        }
    ]
}

# Gemini 3 Pro Image Preview 配置
GEMINI3_PRO_IMAGE_CONFIG = {
    "model_id": "jiekou-gemini3-pro-image",
    "model_name": "Gemini 3 Pro Image Preview",
    "category": "文生图",
    "parameters": [
        {
            "name": "aspect_ratio",
            "label": "宽高比 (Aspect Ratio)",
            "type": "select",
            "default": "1:1",
            "options": [
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
            "description": "生成图片的宽高比"
        },
        {
            "name": "size",
            "label": "图片尺寸 (Size)",
            "type": "select",
            "default": "1K",
            "options": [
                {"value": "1K", "label": "1K"},
                {"value": "2K", "label": "2K"},
                {"value": "4K", "label": "4K"}
            ],
            "description": "生成图片的尺寸档次"
        }
    ]
}

# FLUX.1 Schnell 配置
FLUX_SCHNELL_CONFIG = {
    "model_id": "jiekou-flux-schnell",
    "model_name": "FLUX.1 Schnell",
    "category": "文生图",
    "parameters": [
        {
            "name": "width",
            "label": "宽度 (Width)",
            "type": "number",
            "default": 1024,
            "min": 256,
            "max": 2048,
            "step": 64,
            "description": "生成图片的宽度"
        },
        {
            "name": "height",
            "label": "高度 (Height)",
            "type": "number",
            "default": 1024,
            "min": 256,
            "max": 2048,
            "step": 64,
            "description": "生成图片的高度"
        },
        {
            "name": "num_inference_steps",
            "label": "推理步数 (Inference Steps)",
            "type": "number",
            "default": 4,
            "min": 1,
            "max": 50,
            "step": 1,
            "description": "推理迭代次数，Schnell模型推荐使用较少步数(4-8)"
        }
    ]
}

# Stable Diffusion 3.5 Large 配置
SD35_LARGE_CONFIG = {
    "model_id": "jiekou-sd35-large",
    "model_name": "Stable Diffusion 3.5 Large",
    "category": "文生图",
    "parameters": [
        {
            "name": "negative_prompt",
            "label": "负面提示词 (Negative Prompt)",
            "type": "text",
            "default": "",
            "description": "描述不想在图片中出现的元素"
        },
        {
            "name": "width",
            "label": "宽度 (Width)",
            "type": "number",
            "default": 1024,
            "min": 512,
            "max": 2048,
            "step": 64,
            "description": "生成图片的宽度"
        },
        {
            "name": "height",
            "label": "高度 (Height)",
            "type": "number",
            "default": 1024,
            "min": 512,
            "max": 2048,
            "step": 64,
            "description": "生成图片的高度"
        },
        {
            "name": "guidance_scale",
            "label": "引导强度 (Guidance Scale)",
            "type": "number",
            "default": 7.5,
            "min": 1.0,
            "max": 20.0,
            "step": 0.5,
            "description": "AI遵循提示词的程度"
        },
        {
            "name": "num_inference_steps",
            "label": "推理步数 (Inference Steps)",
            "type": "number",
            "default": 28,
            "min": 10,
            "max": 150,
            "step": 5,
            "description": "推理迭代次数，越高质量越好但速度越慢（默认 28 步，平衡速度和质量）"
        }
    ]
}

# Recraft V3 配置
RECRAFT_V3_CONFIG = {
    "model_id": "jiekou-recraft-v3",
    "model_name": "Recraft V3",
    "category": "文生图",
    "parameters": [
        {
            "name": "style",
            "label": "图片风格 (Style)",
            "type": "select",
            "default": "realistic_image",
            "options": [
                {"value": "realistic_image", "label": "写实图像"},
                {"value": "digital_illustration", "label": "数字插画"},
                {"value": "vector_illustration", "label": "矢量插画"},
                {"value": "realistic_image/b_and_w", "label": "黑白写实"},
                {"value": "realistic_image/hard_flash", "label": "硬闪光"},
                {"value": "realistic_image/hdr", "label": "HDR"},
                {"value": "realistic_image/natural_light", "label": "自然光"},
                {"value": "realistic_image/studio_portrait", "label": "棚拍人像"},
                {"value": "realistic_image/enterprise", "label": "商业风格"},
                {"value": "realistic_image/motion_blur", "label": "动态模糊"}
            ],
            "description": "选择生成图片的艺术风格"
        },
        {
            "name": "size",
            "label": "图片尺寸 (Size)",
            "type": "select",
            "default": "1024x1024",
            "options": [
                {"value": "1024x1024", "label": "1024×1024"},
                {"value": "1365x1024", "label": "1365×1024"},
                {"value": "1024x1365", "label": "1024×1365"},
                {"value": "1536x1024", "label": "1536×1024"},
                {"value": "1024x1536", "label": "1024×1536"},
                {"value": "1820x1024", "label": "1820×1024"},
                {"value": "1024x1820", "label": "1024×1820"},
                {"value": "1024x2048", "label": "1024×2048"},
                {"value": "2048x1024", "label": "2048×1024"},
                {"value": "1434x1024", "label": "1434×1024"},
                {"value": "1024x1434", "label": "1024×1434"},
                {"value": "1024x1280", "label": "1024×1280"},
                {"value": "1280x1024", "label": "1280×1024"},
                {"value": "1024x1707", "label": "1024×1707"}
            ],
            "description": "生成图片的尺寸"
        }
    ]
}

# 模型配置映射
JIEKOU_MODEL_CONFIGS = {
    "jiekou-flux-kontext-dev": FLUX_KONTEXT_DEV_CONFIG,
    "jiekou-gpt-image": GPT_IMAGE_CONFIG,
    "jiekou-qwen-image": QWEN_IMAGE_CONFIG,
    "jiekou-gemini3-pro-image": GEMINI3_PRO_IMAGE_CONFIG,
    "jiekou-flux-schnell": FLUX_SCHNELL_CONFIG,
    "jiekou-sd35-large": SD35_LARGE_CONFIG,
    "jiekou-recraft-v3": RECRAFT_V3_CONFIG
}

