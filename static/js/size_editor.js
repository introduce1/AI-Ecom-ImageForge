// ============================================
// 尺寸编辑器 - 专业图片裁剪工具
// ============================================

// 全局变量
let cropper = null;
let currentMode = 'free'; // 当前模式：free, custom, platform
let originalImage = null;
let currentZoom = 1;

// 平台预设尺寸配置
const platformSizes = {
    taobao: [
        { name: '主图 - 正方形', width: 800, height: 800, desc: '主图推荐尺寸' },
        { name: '主图 - 竖版', width: 750, height: 1000, desc: '竖版商品展示' },
        { name: '详情图 - 宽度固定', width: 1200, height: 0, desc: '高度不限，最小800px' },
        { name: '3:4 竖版', width: 3, height: 4, aspectRatio: 3/4, desc: '适合竖版商品' },
        { name: '1:1 正方形', width: 1, height: 1, aspectRatio: 1, desc: '正方形展示' }
    ],
    jd: [
        { name: '主图 - 正方形', width: 800, height: 800, desc: '主图标准尺寸' },
        { name: '主图 - 小图', width: 350, height: 350, desc: '缩略图尺寸' },
        { name: '详情图', width: 1200, height: 0, desc: '高度不限' },
        { name: '竖版主图', width: 750, height: 1000, desc: '竖版商品' }
    ],
    pdd: [
        { name: '主图 - 800×800', width: 800, height: 800, desc: '推荐主图尺寸' },
        { name: '主图 - 750×750', width: 750, height: 750, desc: '备用主图尺寸' },
        { name: '主图 - 480×480', width: 480, height: 480, desc: '最小主图尺寸' },
        { name: '详情图', width: 1200, height: 0, desc: '高度800-1500px' }
    ],
    common: [
        { name: '1:1 正方形', width: 1, height: 1, aspectRatio: 1, desc: '正方形' },
        { name: '4:3 横版', width: 4, height: 3, aspectRatio: 4/3, desc: '常规横版' },
        { name: '3:4 竖版', width: 3, height: 4, aspectRatio: 3/4, desc: '常规竖版' },
        { name: '16:9 宽屏', width: 16, height: 9, aspectRatio: 16/9, desc: '宽屏展示' },
        { name: '9:16 竖屏', width: 9, height: 16, aspectRatio: 9/16, desc: '竖屏视频' },
        { name: '2:3 竖版', width: 2, height: 3, aspectRatio: 2/3, desc: '海报比例' }
    ]
};

// 最小尺寸限制
const MIN_WIDTH = 50;
const MIN_HEIGHT = 50;

// 初始化
window.onload = function() {
    console.log('[尺寸编辑器] 初始化');
    initUploadArea();
    initEventListeners();
};

// 初始化上传区域
function initUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const imageInput = document.getElementById('image-input');
    
    // 点击上传
    uploadArea.addEventListener('click', (e) => {
        if (e.target !== imageInput) {
            imageInput.click();
        }
    });
    
    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.borderColor = '#4a90e2';
        uploadArea.style.backgroundColor = '#f0f7ff';
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.borderColor = '';
        uploadArea.style.backgroundColor = '';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.borderColor = '';
        uploadArea.style.backgroundColor = '';
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            handleImageFile(files[0]);
        }
    });
}

// 初始化事件监听
function initEventListeners() {
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            resetEditor();
        }
    });
}

// 处理图片上传
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        handleImageFile(file);
    }
}

// 处理图片文件
function handleImageFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        originalImage = e.target.result;
        initCropper(originalImage);
    };
    
    reader.readAsDataURL(file);
}

// 初始化裁剪器
function initCropper(imageSrc) {
    const uploadArea = document.getElementById('upload-area');
    const cropContainer = document.getElementById('crop-container');
    const cropImage = document.getElementById('crop-image');
    const applyBtn = document.getElementById('apply-btn');
    const cropInfo = document.getElementById('crop-info');
    
    // 隐藏上传区域，显示裁剪容器
    uploadArea.style.display = 'none';
    cropContainer.style.display = 'block';
    cropInfo.style.display = 'block';
    
    // 设置图片源
    cropImage.src = imageSrc;
    
    // 销毁旧的裁剪器实例
    if (cropper) {
        cropper.destroy();
    }
    
    // 根据当前模式初始化裁剪器
    const cropperOptions = {
        viewMode: 1,
        dragMode: 'move',
        aspectRatio: NaN, // 默认自由比例
        autoCropArea: 0.8,
        restore: false,
        guides: true,
        center: true,
        highlight: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        minCropBoxWidth: MIN_WIDTH,
        minCropBoxHeight: MIN_HEIGHT,
        crop: function(event) {
            updateCropInfo(event.detail);
        }
    };
    
    // 等待图片加载
    cropImage.onload = function() {
        cropper = new Cropper(cropImage, cropperOptions);
        applyBtn.disabled = false;
        
        // 应用当前模式
        applyCurrentMode();
    };
}

// 更新裁剪信息显示
function updateCropInfo(detail) {
    const width = Math.round(detail.width);
    const height = Math.round(detail.height);
    const ratio = (width / height).toFixed(2);
    
    document.getElementById('crop-width').textContent = width + ' px';
    document.getElementById('crop-height').textContent = height + ' px';
    document.getElementById('crop-ratio').textContent = ratio + ' : 1';
    
    // 检查最小尺寸限制
    if (width < MIN_WIDTH || height < MIN_HEIGHT) {
        document.getElementById('crop-info').style.borderColor = '#f56c6c';
    } else {
        document.getElementById('crop-info').style.borderColor = '';
    }
}

// 切换模式
function switchMode(mode) {
    currentMode = mode;
    
    // 更新tab样式
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.mode === mode) {
            tab.classList.add('active');
        }
    });
    
    // 显示对应的模式内容
    document.querySelectorAll('.mode-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`mode-${mode}`).style.display = 'block';
    
    // 应用模式设置
    if (cropper) {
        applyCurrentMode();
    }
}

// 应用当前模式设置
function applyCurrentMode() {
    if (!cropper) return;
    
    switch(currentMode) {
        case 'free':
            cropper.setAspectRatio(NaN);
            cropper.options.aspectRatio = NaN;
            break;
        case 'custom':
            // 指定尺寸模式会在输入时触发
            break;
        case 'platform':
            // 平台预设会在选择时触发
            break;
    }
}

// 应用自定义尺寸
function applyCustomSize() {
    if (!cropper) return;
    
    const width = parseInt(document.getElementById('custom-width').value);
    const height = parseInt(document.getElementById('custom-height').value);
    
    if (width >= MIN_WIDTH && height >= MIN_HEIGHT) {
        const aspectRatio = width / height;
        cropper.setAspectRatio(aspectRatio);
        
        // 尝试设置裁剪框为指定尺寸
        const imageData = cropper.getImageData();
        const containerData = cropper.getContainerData();
        
        // 计算缩放比例，使裁剪框尽可能接近目标尺寸
        const scale = Math.min(
            containerData.width / width,
            containerData.height / height,
            imageData.naturalWidth / width,
            imageData.naturalHeight / height
        );
        
        const cropWidth = width * scale;
        const cropHeight = height * scale;
        
        cropper.setCropBoxData({
            width: cropWidth,
            height: cropHeight,
            left: (containerData.width - cropWidth) / 2,
            top: (containerData.height - cropHeight) / 2
        });
    }
}

// 平台改变事件
function onPlatformChange() {
    const platform = document.getElementById('platform-select').value;
    const sizeSelectGroup = document.getElementById('size-select-group');
    const sizeSelect = document.getElementById('size-select');
    const platformInfo = document.getElementById('platform-info');
    
    if (!platform) {
        sizeSelectGroup.style.display = 'none';
        platformInfo.style.display = 'none';
        return;
    }
    
    // 显示尺寸选择
    sizeSelectGroup.style.display = 'block';
    
    // 填充尺寸选项
    const sizes = platformSizes[platform];
    sizeSelect.innerHTML = '<option value="">请选择尺寸</option>';
    
    sizes.forEach((size, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = size.name;
        sizeSelect.appendChild(option);
    });
    
    // 显示平台信息
    platformInfo.style.display = 'block';
    const platformNames = {
        taobao: '淘宝/天猫',
        jd: '京东',
        pdd: '拼多多',
        common: '通用比例'
    };
    platformInfo.innerHTML = `
        <div style="padding: 12px; background: #f0f7ff; border-radius: 8px; font-size: 13px; color: #666;">
            <strong style="color: #4a90e2;">${platformNames[platform]}</strong> 平台标准尺寸<br>
            <small>请选择适合您商品的尺寸规格</small>
        </div>
    `;
}

// 应用平台尺寸
function applyPlatformSize() {
    if (!cropper) return;
    
    const platform = document.getElementById('platform-select').value;
    const sizeIndex = document.getElementById('size-select').value;
    
    if (!platform || sizeIndex === '') return;
    
    const size = platformSizes[platform][sizeIndex];
    const platformInfo = document.getElementById('platform-info');
    
    // 更新平台信息显示
    if (size.aspectRatio) {
        // 使用比例
        cropper.setAspectRatio(size.aspectRatio);
        platformInfo.innerHTML = `
            <div style="padding: 12px; background: #f0f7ff; border-radius: 8px; font-size: 13px;">
                <strong style="color: #4a90e2;">${size.name}</strong><br>
                <span style="color: #666;">比例: ${size.width}:${size.height}</span><br>
                <small style="color: #999;">${size.desc}</small>
            </div>
        `;
    } else if (size.height === 0) {
        // 宽度固定，高度不限
        cropper.setAspectRatio(NaN);
        platformInfo.innerHTML = `
            <div style="padding: 12px; background: #fff3cd; border-radius: 8px; font-size: 13px;">
                <strong style="color: #856404;">${size.name}</strong><br>
                <span style="color: #666;">宽度: ${size.width}px</span><br>
                <span style="color: #666;">高度: 自由调整</span><br>
                <small style="color: #999;">${size.desc}</small>
            </div>
        `;
    } else {
        // 固定尺寸
        const aspectRatio = size.width / size.height;
        cropper.setAspectRatio(aspectRatio);
        
        // 尝试设置裁剪框为目标尺寸
        const imageData = cropper.getImageData();
        const containerData = cropper.getContainerData();
        const scale = Math.min(
            containerData.width / size.width,
            containerData.height / size.height,
            imageData.naturalWidth / size.width,
            imageData.naturalHeight / size.height,
            1
        );
        
        const cropWidth = size.width * scale;
        const cropHeight = size.height * scale;
        
        cropper.setCropBoxData({
            width: cropWidth,
            height: cropHeight,
            left: (containerData.width - cropWidth) / 2,
            top: (containerData.height - cropHeight) / 2
        });
        
        platformInfo.innerHTML = `
            <div style="padding: 12px; background: #d4edda; border-radius: 8px; font-size: 13px;">
                <strong style="color: #155724;">${size.name}</strong><br>
                <span style="color: #666;">尺寸: ${size.width}×${size.height}px</span><br>
                <small style="color: #999;">${size.desc}</small>
            </div>
        `;
    }
}

// 缩放控制
function zoomIn() {
    if (cropper) {
        cropper.zoom(0.1);
        updateZoomDisplay();
    }
}

function zoomOut() {
    if (cropper) {
        cropper.zoom(-0.1);
        updateZoomDisplay();
    }
}

function resetZoom() {
    if (cropper) {
        cropper.reset();
        updateZoomDisplay();
    }
}

function updateZoomDisplay() {
    if (cropper) {
        const imageData = cropper.getImageData();
        const zoom = Math.round(imageData.width / imageData.naturalWidth * 100);
        document.getElementById('zoom-display').textContent = zoom + '%';
    }
}

// 应用裁剪
function applyCrop() {
    if (!cropper) return;
    
    const cropData = cropper.getData();
    
    // 检查最小尺寸
    if (cropData.width < MIN_WIDTH || cropData.height < MIN_HEIGHT) {
        alert(`裁剪区域太小！最小尺寸为 ${MIN_WIDTH}×${MIN_HEIGHT} px`);
        return;
    }
    
    // 获取裁剪后的canvas
    let canvas;
    
    // 根据模式决定输出尺寸
    if (currentMode === 'custom') {
        const targetWidth = parseInt(document.getElementById('custom-width').value);
        const targetHeight = parseInt(document.getElementById('custom-height').value);
        
        if (targetWidth >= MIN_WIDTH && targetHeight >= MIN_HEIGHT) {
            canvas = cropper.getCroppedCanvas({
                width: targetWidth,
                height: targetHeight,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });
        } else {
            canvas = cropper.getCroppedCanvas({
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });
        }
    } else if (currentMode === 'platform') {
        const platform = document.getElementById('platform-select').value;
        const sizeIndex = document.getElementById('size-select').value;
        
        if (platform && sizeIndex !== '') {
            const size = platformSizes[platform][sizeIndex];
            
            if (size.width > 10 && size.height > 10 && !size.aspectRatio) {
                // 固定尺寸
                canvas = cropper.getCroppedCanvas({
                    width: size.width,
                    height: size.height === 0 ? undefined : size.height,
                    imageSmoothingEnabled: true,
                    imageSmoothingQuality: 'high'
                });
            } else {
                // 比例裁剪，保持原始质量
                canvas = cropper.getCroppedCanvas({
                    imageSmoothingEnabled: true,
                    imageSmoothingQuality: 'high'
                });
            }
        } else {
            canvas = cropper.getCroppedCanvas({
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });
        }
    } else {
        // 自由裁剪，保持原始尺寸
        canvas = cropper.getCroppedCanvas({
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });
    }
    
    // 显示结果
    showResult(canvas);
}

// 显示裁剪结果
function showResult(canvas) {
    const resultPreview = document.getElementById('result-preview');
    const resultCanvas = document.getElementById('result-canvas');
    const resultInfo = document.getElementById('result-info');
    const resultActions = document.getElementById('result-actions');
    
    // 隐藏空状态
    resultPreview.querySelector('.result-empty').style.display = 'none';
    
    // 显示结果canvas
    resultCanvas.style.display = 'block';
    resultCanvas.width = canvas.width;
    resultCanvas.height = canvas.height;
    
    const ctx = resultCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    
    // 更新结果信息
    resultInfo.style.display = 'block';
    resultActions.style.display = 'flex';
    
    document.getElementById('result-size').textContent = `${canvas.width}×${canvas.height} px`;
    
    // 估算文件大小
    canvas.toBlob(blob => {
        const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
        const sizeKB = (blob.size / 1024).toFixed(2);
        const sizeText = blob.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
        document.getElementById('result-filesize').textContent = sizeText;
    });
}

// 下载结果
function downloadResult() {
    const canvas = document.getElementById('result-canvas');
    
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cropped_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

// 重置编辑器
function resetEditor() {
    // 销毁裁剪器
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    
    // 重置界面
    document.getElementById('upload-area').style.display = 'flex';
    document.getElementById('crop-container').style.display = 'none';
    document.getElementById('crop-info').style.display = 'none';
    document.getElementById('apply-btn').disabled = true;
    
    // 重置结果区域
    document.getElementById('result-canvas').style.display = 'none';
    document.getElementById('result-preview').querySelector('.result-empty').style.display = 'flex';
    document.getElementById('result-info').style.display = 'none';
    document.getElementById('result-actions').style.display = 'none';
    
    // 重置输入
    document.getElementById('image-input').value = '';
    document.getElementById('custom-width').value = '';
    document.getElementById('custom-height').value = '';
    document.getElementById('platform-select').value = '';
    document.getElementById('size-select').value = '';
    document.getElementById('size-select-group').style.display = 'none';
    document.getElementById('platform-info').style.display = 'none';
    
    // 切换回自由模式
    switchMode('free');
    
    originalImage = null;
    currentZoom = 1;
}

