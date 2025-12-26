# ==========================================
# PaddleOCR 服务类
# 使用 ch_PP-OCRv4 轻量版模型
# ==========================================

import os
import logging
import numpy as np
from PIL import Image
import io

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OCRService:
    """PaddleOCR 服务类（单例模式）"""
    
    _instance = None
    _ocr = None
    _initialized = False
    _use_gpu = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(OCRService, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            try:
                from paddleocr import PaddleOCR
                import paddle
                
                # 尝试初始化 GPU，如果失败则使用 CPU
                use_gpu = False
                gpu_available = False
                
                # 检查 CUDA 编译支持
                if paddle.device.is_compiled_with_cuda():
                    try:
                        # 尝试设置 GPU 设备
                        paddle.device.set_device('gpu')
                        # 尝试创建一个简单的 tensor 来验证 GPU 是否真的可用
                        test_tensor = paddle.to_tensor([1.0])
                        gpu_available = True
                        use_gpu = True
                        logger.info("[OCR] ✅ GPU 可用，将使用 GPU 加速")
                    except Exception as e:
                        logger.warning(f"[OCR] ⚠️ GPU 检测失败: {e}")
                        logger.warning("[OCR] 将回退到 CPU 模式")
                        paddle.device.set_device('cpu')
                        use_gpu = False
                else:
                    logger.info("[OCR] PaddlePaddle 未编译 CUDA 支持，使用 CPU")
                    use_gpu = False
                
                logger.info(f"[OCR] 正在初始化 PaddleOCR (使用 {'GPU' if use_gpu else 'CPU'})...")
                logger.info("[OCR] 首次运行会下载模型文件，请耐心等待...")
                
                # 初始化 PaddleOCR
                try:
                    self._ocr = PaddleOCR(
                        use_angle_cls=True,  # 使用方向分类器，提高识别准确率
                        lang='ch',           # 使用中文模型
                        use_gpu=use_gpu,     # 使用GPU加速（如果有）
                        det_model_dir=None,  # 使用默认检测模型
                        rec_model_dir=None,  # 使用默认识别模型
                        cls_model_dir=None   # 使用默认分类模型
                    )
                    
                    self._initialized = True
                    self._use_gpu = use_gpu
                    logger.info(f"[OCR] ✅ PaddleOCR 初始化成功 (使用 {'GPU' if use_gpu else 'CPU'})")
                    
                except Exception as init_error:
                    # 如果 GPU 模式初始化失败，尝试 CPU 模式
                    if use_gpu:
                        logger.warning(f"[OCR] GPU 模式初始化失败: {init_error}")
                        logger.info("[OCR] 尝试使用 CPU 模式重新初始化...")
                        paddle.device.set_device('cpu')
                        self._ocr = PaddleOCR(
                            use_angle_cls=True,
                            lang='ch',
                            use_gpu=False,  # 强制使用 CPU
                            det_model_dir=None,
                            rec_model_dir=None,
                            cls_model_dir=None
                        )
                        self._initialized = True
                        self._use_gpu = False
                        logger.info("[OCR] ✅ PaddleOCR CPU 模式初始化成功")
                    else:
                        raise
                
            except ImportError:
                logger.error("[OCR] ❌ 未安装 PaddleOCR，请运行: pip install paddleocr==2.7.3")
                raise
            except Exception as e:
                logger.error(f"[OCR] ❌ 初始化失败: {e}")
                raise
    
    def recognize(self, image_bytes):
        """
        识别图片中的文字
        
        Args:
            image_bytes: 图片的 bytes 数据
        
        Returns:
            list: 识别结果列表，格式：
                [
                    {
                        "id": "region_1",
                        "x": 100,
                        "y": 50,
                        "width": 200,
                        "height": 30,
                        "text": "识别的文字",
                        "confidence": 0.95,
                        "bbox": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                    }
                ]
        """
        try:
            if not self._ocr:
                raise RuntimeError("OCR 服务未初始化")
            
            # 将 bytes 转换为 PIL Image
            img = Image.open(io.BytesIO(image_bytes))
            
            # 转换为 RGB 格式（如果不是）
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # 转换为 numpy array
            img_array = np.array(img)
            
            # 执行 OCR
            logger.info("[OCR] 开始识别文字...")
            
            try:
                result = self._ocr.ocr(img_array, cls=True)
            except RuntimeError as gpu_error:
                # 如果 GPU 模式失败，尝试重新初始化为 CPU 模式
                if self._use_gpu and "cudnn" in str(gpu_error).lower() or "cuda" in str(gpu_error).lower():
                    logger.warning(f"[OCR] GPU 模式执行失败: {gpu_error}")
                    logger.info("[OCR] 尝试切换到 CPU 模式...")
                    
                    # 重新初始化为 CPU 模式
                    from paddleocr import PaddleOCR
                    import paddle
                    paddle.device.set_device('cpu')
                    
                    self._ocr = PaddleOCR(
                        use_angle_cls=True,
                        lang='ch',
                        use_gpu=False,
                        det_model_dir=None,
                        rec_model_dir=None,
                        cls_model_dir=None
                    )
                    self._use_gpu = False
                    logger.info("[OCR] ✅ 已切换到 CPU 模式，重新执行识别...")
                    
                    # 重新执行识别
                    result = self._ocr.ocr(img_array, cls=True)
                else:
                    raise
            
            # 转换结果格式
            text_regions = self._convert_result(result[0] if result else [])
            
            logger.info(f"[OCR] ✅ 识别完成，共识别到 {len(text_regions)} 个文字区域")
            
            return text_regions
            
        except Exception as e:
            logger.error(f"[OCR] ❌ 识别失败: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def _convert_result(self, ocr_result):
        """
        转换 OCR 结果格式
        
        PaddleOCR 返回格式：
        [
            [
                [[x1, y1], [x2, y2], [x3, y3], [x4, y4]],  # 四个顶点坐标
                ('识别的文字', 置信度)
            ],
            ...
        ]
        
        转换为前端需要的格式：
        {
            "id": "region_1",
            "x": 100,        # 左上角 x 坐标
            "y": 50,         # 左上角 y 坐标
            "width": 200,    # 宽度
            "height": 30,    # 高度
            "text": "识别的文字",
            "confidence": 0.95,
            "bbox": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]  # 保留原始四个顶点
        }
        """
        text_regions = []
        
        for idx, item in enumerate(ocr_result):
            if not item or len(item) < 2:
                continue
            
            bbox = item[0]  # 四个顶点坐标
            text, confidence = item[1]  # 文字内容和置信度
            
            # 计算边界框（从四个顶点计算最小外接矩形）
            xs = [point[0] for point in bbox]
            ys = [point[1] for point in bbox]
            
            x_min = int(min(xs))
            y_min = int(min(ys))
            x_max = int(max(xs))
            y_max = int(max(ys))
            
            width = x_max - x_min
            height = y_max - y_min
            
            # 过滤掉太小的区域（可能是误识别）
            if width < 10 or height < 10:
                continue
            
            text_regions.append({
                "id": f"region_{idx + 1}",
                "x": x_min,
                "y": y_min,
                "width": width,
                "height": height,
                "text": text,
                "confidence": float(confidence),
                "bbox": bbox  # 保留原始四个顶点，可能有用
            })
        
        return text_regions


# 创建全局单例
_ocr_service = None

def get_ocr_service():
    """获取 OCR 服务单例"""
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService()
    return _ocr_service

