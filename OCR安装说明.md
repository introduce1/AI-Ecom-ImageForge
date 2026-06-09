# OCR 服务安装说明

## 📋 概述

本项目使用 **PaddleOCR** 进行文字识别（OCR）功能。OCR 服务支持中英文识别，并自动适配 GPU/CPU 模式。

## 🔧 使用的 OCR 版本

- **OCR 库**: PaddleOCR
- **版本**: 2.7.3
- **模型**: ch_PP-OCRv4 轻量版（中文模型）
- **支持语言**: 中文（`lang='ch'`）

## 📦 安装步骤

### 方法一：使用 pip 安装（推荐）

```bash
# 安装 PaddleOCR（会自动安装依赖）
pip install paddleocr==2.7.3
```

### 方法二：安装完整依赖（包含 PaddlePaddle）

如果您需要 GPU 加速支持，建议安装 GPU 版本的 PaddlePaddle：

```bash
# CPU 版本（推荐新手）
pip install paddlepaddle==2.5.2 -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install paddleocr==2.7.3

# GPU 版本（需要 CUDA 支持）
# 根据您的 CUDA 版本选择对应的安装命令，详见 PaddlePaddle 官方文档
pip install paddlepaddle-gpu==2.5.2 -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install paddleocr==2.7.3
```


## 📥 模型文件下载

**首次运行时会自动下载模型文件**，请确保网络连接正常。

- **下载位置**: `~/.paddleocr/` 目录（Windows 通常在 `C:\Users\用户名\.paddleocr\`）
- **模型大小**: 约 100-200 MB（轻量版模型）
- **下载时间**: 根据网络速度，可能需要几分钟

### 手动下载模型（可选）

如果您希望手动下载模型文件，可以访问 [PaddleOCR 模型库](https://github.com/PaddlePaddle/PaddleOCR/blob/release/2.7/doc/doc_ch/models_list.md) 查看模型下载地址。

## ⚙️ 功能特性

### 自动 GPU/CPU 切换

OCR 服务会自动检测并使用可用的硬件：

- **GPU 模式**: 如果检测到 CUDA 和 GPU，自动使用 GPU 加速
- **CPU 模式**: 如果 GPU 不可用，自动回退到 CPU 模式
- **智能回退**: GPU 模式失败时自动切换到 CPU 模式

### 识别功能

- ✅ **中文识别**: 高精度中文文字识别
- ✅ **文字区域检测**: 自动检测图片中的文字区域
- ✅ **方向分类**: 自动校正文字方向（`use_angle_cls=True`）
- ✅ **置信度评分**: 每个识别结果都包含置信度分数
- ✅ **坐标定位**: 提供文字区域的精确坐标位置

## 🚀 使用示例

```python
from ocr_service import get_ocr_service

# 获取 OCR 服务实例（单例模式）
ocr = get_ocr_service()

# 读取图片
with open('image.png', 'rb') as f:
    image_bytes = f.read()

# 执行识别
text_regions = ocr.recognize(image_bytes)

# 处理识别结果
for region in text_regions:
    print(f"文字: {region['text']}")
    print(f"位置: ({region['x']}, {region['y']})")
    print(f"置信度: {region['confidence']:.2%}")
```

## ⚠️ 常见问题

### 1. 安装失败

**问题**: `pip install paddleocr` 失败

**解决方案**:
```bash
# 使用国内镜像源加速
pip install paddleocr==2.7.3 -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 2. 首次运行很慢

**问题**: 第一次使用 OCR 时加载很慢

**原因**: 首次运行需要下载模型文件（约 100-200 MB）

**解决方案**: 请耐心等待，模型文件下载后会缓存在本地，后续使用会很快。

### 3. GPU 未使用

**问题**: 有 GPU 但 OCR 仍使用 CPU

**检查步骤**:
1. 确认已安装 `paddlepaddle-gpu` 而不是 `paddlepaddle`
2. 确认 CUDA 版本兼容
3. 查看日志输出，OCR 服务会显示使用的是 GPU 还是 CPU

### 4. 模型下载失败

**问题**: 网络问题导致模型下载失败

**解决方案**:
- 检查网络连接
- 使用代理或 VPN
- 手动下载模型文件并放置到 `~/.paddleocr/` 目录

## 📚 参考资料

- [PaddleOCR 官方文档](https://github.com/PaddlePaddle/PaddleOCR)
- [PaddleOCR 2.7 版本说明](https://github.com/PaddlePaddle/PaddleOCR/releases/tag/v2.7.0.3)
- [PaddlePaddle 安装指南](https://www.paddlepaddle.org.cn/install/quick)

## 📝 版本信息

- **PaddleOCR**: 2.7.3
- **PaddlePaddle**: 2.5.2（推荐）
- **Python**: 3.7+（推荐 3.8+）

---

**注意**: 如果您的项目已有其他版本的 PaddleOCR，建议先卸载旧版本：

```bash
pip uninstall paddleocr paddlepaddle paddlepaddle-gpu
pip install paddleocr==2.7.3
```

