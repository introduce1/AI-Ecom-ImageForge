// ============================================
// Logo Editor - 批量Logo添加工具
// ============================================

// 全局变量
let canvas = null;
let uploadedImages = []; // 存储上传的图片信息
let currentImageIndex = -1; // 当前预览的图片索引
let logoSettings = {
    platform: '',
    style: '',
    size: '',      // 新增：尺寸规格
    logoColor: '',
    logoSize: 100, // 百分比（100% = 原Logo尺寸，范围5-200%）
    marginX: 20,
    marginY: 20,
    logoPath: ''  // 当前选中的Logo文件路径
};

// 当前尺寸限制（根据选择的尺寸规格设置）
let currentSizeRequirement = null;

// 尺寸规格定义（根据文件夹名解析）
const sizeSpecs = {
    '800-800': { width: 800, height: 800, name: '800×800 正方形主图', displayName: '800×800 (正方形)' },
    '750-1000': { width: 750, height: 1000, name: '750×1000 竖版主图', displayName: '750×1000 (竖版)' },
    '1024-1024': { width: 1024, height: 1024, name: '1024×1024 正方形主图', displayName: '1024×1024 (正方形)' },
    '1200-': { width: 1200, minHeight: 800, name: '1200×高度不限 详情图', displayName: '1200×N (详情图)' },
    '1440-1440': { width: 1440, height: 1440, name: '1440×1440 正方形主图', displayName: '1440×1440 (正方形)' }
};

// 初始化
window.onload = function() {
    console.log('[Logo编辑器] 初始化');
    initCanvas();
    initUploadZone();
    initEventListeners();
};

// 初始化Canvas
function initCanvas() {
    // 获取canvas容器
    const canvasWrapper = document.getElementById('canvas-wrapper');
    
    // 初始设置为容器大小（占满整个中间区域）
    const containerWidth = canvasWrapper.clientWidth;
    const containerHeight = canvasWrapper.clientHeight;
    
    canvas = new fabric.Canvas('logo-canvas', {
        width: containerWidth,
        height: containerHeight,
        backgroundColor: '#ffffff',
        selection: false
    });
    
    // 监听窗口大小变化，自适应容器
    window.addEventListener('resize', () => {
        const wrapper = document.getElementById('canvas-wrapper');
        const newWidth = wrapper.clientWidth;
        const newHeight = wrapper.clientHeight;
        
        // 保持当前缩放比例
        const currentZoom = canvas.getZoom();
        canvas.setDimensions({ width: newWidth, height: newHeight });
        canvas.setZoom(currentZoom);
        canvas.renderAll();
    });
    
    // 添加滚轮缩放功能
    canvas.on('mouse:wheel', function(opt) {
        const delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        
        // 滚轮向下（deltaY > 0）缩小，向上（deltaY < 0）放大
        zoom *= (0.999 ** delta);
        
        // 限制缩放范围
        zoom = Math.max(0.1, Math.min(5, zoom));
        
        // 获取产品图片的中心点（用于缩放基准）
        const productImg = canvas.getObjects().find(o => o.name === 'product-image');
        let zoomPoint;
        
        if (productImg) {
            // 将鼠标坐标转换为画布坐标（考虑画布的viewport变换）
            const pointer = canvas.getPointer(opt.e);
            const imgBounds = {
                left: productImg.left,
                top: productImg.top,
                right: productImg.left + productImg.width * productImg.scaleX,
                bottom: productImg.top + productImg.height * productImg.scaleY
            };
            
            // 如果鼠标在产品图片内，以鼠标位置为基准；否则以图片中心为基准
            if (pointer.x >= imgBounds.left && pointer.x <= imgBounds.right &&
                pointer.y >= imgBounds.top && pointer.y <= imgBounds.bottom) {
                zoomPoint = pointer;
            } else {
                // 以图片中心为基准
                const centerX = productImg.left + (productImg.width * productImg.scaleX) / 2;
                const centerY = productImg.top + (productImg.height * productImg.scaleY) / 2;
                zoomPoint = new fabric.Point(centerX, centerY);
            }
        } else {
            // 如果没有图片，以鼠标位置为基准
            zoomPoint = canvas.getPointer(opt.e);
        }
        
        canvas.zoomToPoint(zoomPoint, zoom);
        
        updateZoomLevel();
        opt.e.preventDefault();
        opt.e.stopPropagation();
    });
    
    // 监听对象移动事件，更新Logo位置设置
    canvas.on('object:modified', function(e) {
        const obj = e.target;
        if (obj && obj.name === 'logo') {
            // 获取产品图片对象
            const productImg = canvas.getObjects().find(o => o.name === 'product-image');
            if (productImg) {
                // 计算相对于产品图片的位置（边距）
                const relativeX = obj.left - productImg.left;
                const relativeY = obj.top - productImg.top;
                
                // 更新边距设置
                logoSettings.marginX = Math.round(relativeX);
                logoSettings.marginY = Math.round(relativeY);
                
                // 更新UI显示
                document.getElementById('margin-x-slider').value = logoSettings.marginX;
                document.getElementById('margin-x-input').value = logoSettings.marginX;
                document.getElementById('margin-y-slider').value = logoSettings.marginY;
                document.getElementById('margin-y-input').value = logoSettings.marginY;
                
                console.log(`[Logo位置] 拖动后更新: marginX=${logoSettings.marginX}, marginY=${logoSettings.marginY}`);
            }
        }
    });
    
    console.log('[Canvas] 初始化完成，尺寸:', containerWidth, 'x', containerHeight);
}

// 初始化上传区域
function initUploadZone() {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('image-upload-input');
    
    // 点击上传
    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });
    
    // 文件选择
    fileInput.addEventListener('change', (e) => {
        handleFileUpload(e.target.files);
        e.target.value = ''; // 清空input，允许重复选择同一文件
    });
    
    // 拖拽上传
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.style.borderColor = 'var(--logo-primary)';
    });
    
    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.style.borderColor = '';
    });
    
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.style.borderColor = '';
        
        const files = Array.from(e.dataTransfer.files).filter(file => 
            file.type.startsWith('image/')
        );
        
        if (files.length > 0) {
            handleFileUpload(files);
        }
    });
    
    console.log('[上传] 上传区域初始化完成');
}

// 初始化事件监听
function initEventListeners() {
    // 同步滑块和输入框
    syncSliderInput('logo-size-slider', 'logo-size-input');
    syncSliderInput('margin-x-slider', 'margin-x-input');
    syncSliderInput('margin-y-slider', 'margin-y-input');
    
    // 缩放比例输入框事件
    const zoomInput = document.getElementById('zoom-level');
    if (zoomInput) {
        // 失去焦点时应用缩放
        zoomInput.addEventListener('blur', setZoomByInput);
        
        // 按Enter键时应用缩放
        zoomInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                setZoomByInput();
                zoomInput.blur(); // 失去焦点
            }
        });
        
        // 点击时选中文本，方便输入
        zoomInput.addEventListener('click', function() {
            this.select();
        });
    }
}

// 滑块和输入框同步
function syncSliderInput(sliderId, inputId) {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);
    
    slider.addEventListener('input', () => {
        input.value = slider.value;
    });
    
    input.addEventListener('input', () => {
        slider.value = input.value;
    });
}

// 处理文件上传
async function handleFileUpload(files) {
    console.log(`[上传] 处理 ${files.length} 个文件`);
    
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            console.warn(`[上传] 跳过非图片文件: ${file.name}`);
            continue;
        }
        
        // 读取图片
        const dataURL = await readFileAsDataURL(file);
        
        // 获取图片尺寸
        const { width, height } = await getImageDimensions(dataURL);
        
        // 检查图片规格
        const specCheck = checkImageSpec(width, height);
        
        // 添加到列表
        const imageData = {
            id: Date.now() + Math.random(),
            name: file.name,
            dataURL: dataURL,
            width: width,
            height: height,
            size: file.size,
            specCheck: specCheck,
            hasLogo: false,
            resultDataURL: null
        };
        
        uploadedImages.push(imageData);
        console.log(`[上传] 添加图片: ${file.name} (${width}x${height})`);
    }
    
    // 更新UI
    updateImageList();
    updateImageCount();
    
    // 自动选择第一张
    if (currentImageIndex === -1 && uploadedImages.length > 0) {
        selectImage(0);
    }
    
    // 启用导出按钮
    if (uploadedImages.length > 0) {
        document.getElementById('export-btn').disabled = false;
    }
}

// 读取文件为DataURL
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 获取图片尺寸
function getImageDimensions(dataURL) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = reject;
        img.src = dataURL;
    });
}

// 检查图片规格
function checkImageSpec(width, height) {
    // 如果已选择尺寸规格，严格按照该规格检查
    if (currentSizeRequirement) {
        const req = currentSizeRequirement;
        
        // 检查1200-（高度不限）
        if (req.width === 1200 && !req.height) {
            if (width === 1200 && height >= req.minHeight) {
                return { 
                    spec: '1200-', 
                    match: true, 
                    message: `✓ ${width}×${height} 符合要求` 
                };
            } else {
                return {
                    spec: null,
                    match: false,
                    message: `✗ ${width}×${height} 不符合 (要求: 1200×≥800)`
                };
            }
        }
        
        // 检查固定尺寸
        if (width === req.width && height === req.height) {
            return { 
                spec: logoSettings.size, 
                match: true, 
                message: `✓ ${width}×${height} 符合要求` 
            };
        } else {
            return {
                spec: null,
                match: false,
                message: `✗ ${width}×${height} 不符合 (要求: ${req.width}×${req.height})`
            };
        }
    }
    
    // 如果未选择尺寸规格，自动识别
    if (width === 800 && height === 800) {
        return { spec: '800-800', match: true, message: '✓ 800×800 正方形（请在右侧选择对应尺寸）' };
    }
    
    if (width === 750 && height === 1000) {
        return { spec: '750-1000', match: true, message: '✓ 750×1000 竖版（请在右侧选择对应尺寸）' };
    }
    
    if (width === 1024 && height === 1024) {
        return { spec: '1024-1024', match: true, message: '✓ 1024×1024 正方形（请在右侧选择对应尺寸）' };
    }
    
    if (width === 1200 && height >= 800) {
        return { spec: '1200-', match: true, message: `✓ 1200×${height} 详情图（请在右侧选择对应尺寸）` };
    }
    
    if (width === 1440 && height === 1440) {
        return { spec: '1440-1440', match: true, message: '✓ 1440×1440 正方形（请在右侧选择对应尺寸）' };
    }
    
    // 尺寸不匹配
    let suggestion = '';
    if (width === height) {
        // 正方形图片，根据尺寸推荐
        if (width === 800) {
            suggestion = '建议选择 800×800 规格';
        } else if (width === 1024) {
            suggestion = '建议选择 1024×1024 规格';
        } else if (width === 1440) {
            suggestion = '建议选择 1440×1440 规格';
        } else {
            suggestion = '建议选择对应的正方形规格';
        }
    } else if (width === 750) {
        suggestion = '建议选择 750×1000 规格';
    } else if (width === 1200) {
        suggestion = '建议选择 1200×N 规格';
    } else {
        suggestion = '请先在右侧选择尺寸规格';
    }
    
    return { 
        spec: null, 
        match: false, 
        message: `⚠ ${width}×${height} (${suggestion})` 
    };
}

// 更新图片列表
function updateImageList() {
    const container = document.getElementById('image-thumbnails');
    container.innerHTML = '';
    
    uploadedImages.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'thumbnail-item';
        if (index === currentImageIndex) {
            item.classList.add('active');
        }
        item.onclick = () => selectImage(index);
        
        // 状态标签
        const statusClass = img.specCheck.match ? 'status-match' : 'status-warning';
        const statusText = img.specCheck.match ? '✓ 规格匹配' : '⚠ 非标准';
        
        item.innerHTML = `
            <img src="${img.dataURL}" class="thumbnail-img" alt="${img.name}">
            <div class="thumbnail-info">
                <span class="thumbnail-name" title="${img.name}">${img.name}</span>
                <span class="thumbnail-size">${img.width}×${img.height}</span>
            </div>
            <div class="thumbnail-status ${statusClass}">${statusText}</div>
            <button class="thumbnail-delete" onclick="deleteImage(${index}); event.stopPropagation();">×</button>
        `;
        
        container.appendChild(item);
    });
}

// 更新图片计数
function updateImageCount() {
    document.getElementById('image-count').textContent = `${uploadedImages.length}张`;
}

// 选择图片
function selectImage(index) {
    if (index < 0 || index >= uploadedImages.length) return;
    
    currentImageIndex = index;
    const img = uploadedImages[index];
    
    console.log(`[选择] 切换到图片 ${index + 1}: ${img.name}`);
    
    // 更新列表高亮
    updateImageList();
    
    // 显示在画布上
    displayImageOnCanvas(img);
    
    // 更新画布信息
    updateCanvasInfo(img);
    
    // 隐藏占位符
    document.getElementById('canvas-placeholder').style.display = 'none';
    
    // 启用下载按钮（如果有处理过的图片）
    updateDownloadButton();
}

// 在画布上显示图片
function displayImageOnCanvas(img) {
    // 清空画布
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    
    // 获取canvas容器尺寸（占满整个中间区域）
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const containerWidth = canvasWrapper.clientWidth;
    const containerHeight = canvasWrapper.clientHeight;
    
    // 设置canvas尺寸为容器大小
    canvas.setDimensions({ width: containerWidth, height: containerHeight });
    
    // 重置缩放为100%（原大小）
    canvas.setZoom(1);
    // 重置画布视图位置，确保居中
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    updateZoomLevel();
    
    // 加载图片
    fabric.Image.fromURL(img.dataURL, (fabricImg) => {
        // 默认以100%原大小显示图片
        // 图片居中显示
        const imgWidth = img.width;
        const imgHeight = img.height;
        
        // 计算居中位置（确保图片中心在画布中心）
        const left = (containerWidth - imgWidth) / 2;
        const top = (containerHeight - imgHeight) / 2;
        
        // 设置图片为原大小（scaleX和scaleY都为1）
        fabricImg.set({
            left: left,
            top: top,
            scaleX: 1,
            scaleY: 1,
            selectable: true,  // 允许选中和拖动
            evented: true,     // 允许交互
            hasControls: false, // 不显示控制点（只允许拖动，不允许缩放）
            hasBorders: true,  // 显示边框（选中时显示）
            lockMovementX: false, // 允许水平移动
            lockMovementY: false, // 允许垂直移动
            lockScalingX: true,  // 锁定水平缩放
            lockScalingY: true,  // 锁定垂直缩放
            lockRotation: true,  // 锁定旋转
            name: 'product-image' // 设置名称以便识别
        });
        
        canvas.add(fabricImg);
        canvas.sendToBack(fabricImg);
        
        // 确保图片在画布中心可见
        canvas.renderAll();
        
        // 如果已经选择了Logo，立即显示
        // 注意：由于图片是100%显示，scale参数应该是1
        if (logoSettings.logoPath) {
            addLogoToCanvas(img, 1);
        }
        
        canvas.renderAll();
    });
}

// 更新画布信息
function updateCanvasInfo(img) {
    document.getElementById('image-name').textContent = img.name;
    document.getElementById('image-size').textContent = `${img.width}×${img.height}`;
    
    const badge = document.getElementById('image-spec-match');
    badge.textContent = img.specCheck.message;
    badge.className = 'spec-badge ' + (img.specCheck.match ? 'spec-match' : 'spec-warning');
}

// 删除图片
function deleteImage(index) {
    if (confirm(`确定要删除 "${uploadedImages[index].name}" 吗？`)) {
        console.log(`[删除] 删除图片 ${index + 1}`);
        uploadedImages.splice(index, 1);
        
        // 更新UI
        updateImageList();
        updateImageCount();
        
        // 如果删除的是当前图片
        if (index === currentImageIndex) {
            if (uploadedImages.length > 0) {
                selectImage(Math.min(index, uploadedImages.length - 1));
            } else {
                currentImageIndex = -1;
                canvas.clear();
                document.getElementById('canvas-placeholder').style.display = 'flex';
                document.getElementById('canvas-info').style.display = 'none';
            }
        } else if (index < currentImageIndex) {
            currentImageIndex--;
        }
        
        // 如果没有图片了，禁用按钮
        if (uploadedImages.length === 0) {
            document.getElementById('export-btn').disabled = true;
            document.getElementById('apply-all-btn').disabled = true;
        }
    }
}

// 平台选择改变
async function onPlatformChange() {
    const platform = document.getElementById('platform-select').value;
    const styleSelect = document.getElementById('style-select');
    const sizeSelect = document.getElementById('size-select');
    const hint = document.getElementById('platform-hint');
    
    logoSettings.platform = platform;
    
    // 重置后续选择
    logoSettings.style = '';
    logoSettings.size = '';
    logoSettings.logoPath = '';
    currentSizeRequirement = null;
    
    // 禁用后续选择器
    sizeSelect.disabled = true;
    sizeSelect.innerHTML = '<option value="">请先选择款式</option>';
    document.getElementById('size-hint').innerHTML = '';
    document.getElementById('logo-style-section').style.display = 'none';
    document.getElementById('apply-all-btn').disabled = true;
    
    if (!platform) {
        styleSelect.disabled = true;
        styleSelect.innerHTML = '<option value="">请先选择平台</option>';
        hint.innerHTML = '';
        return;
    }
    
    console.log(`[平台] 选择: ${platform}`);
    
    // 从服务器获取款式列表
    try {
        hint.className = 'platform-hint hint-info';
        hint.innerHTML = `正在加载 <strong>${platform}</strong> 平台的款式...`;
        
        const response = await fetch('/api/logo/styles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: platform })
        });
        
        const data = await response.json();
        
        if (data.success && data.styles && data.styles.length > 0) {
            styleSelect.disabled = false;
            styleSelect.innerHTML = '<option value="">请选择款式</option>';
            
            data.styles.forEach(style => {
                const option = document.createElement('option');
                option.value = style;
                option.textContent = style;
                styleSelect.appendChild(option);
            });
            
            hint.className = 'platform-hint hint-info';
            hint.innerHTML = `✓ 已加载 ${data.styles.length} 个款式选项`;
        } else {
            hint.className = 'platform-hint hint-warning';
            const errorMsg = data.error || '未知错误';
            hint.innerHTML = `⚠ 该平台暂无可用款式<br><small>错误: ${errorMsg}</small>`;
            console.error('[平台] 加载款式失败:', data);
        }
    } catch (error) {
        console.error('[平台] 加载款式失败:', error);
        hint.className = 'platform-hint hint-warning';
        hint.innerHTML = `⚠ 加载款式失败，请重试<br><small>错误: ${error.message || error}</small>`;
    }
}

// 款式选择改变
async function onStyleChange() {
    const style = document.getElementById('style-select').value;
    const sizeSelect = document.getElementById('size-select');
    const hint = document.getElementById('style-hint');
    
    logoSettings.style = style;
    logoSettings.size = '';
    logoSettings.logoPath = '';
    currentSizeRequirement = null;
    
    // 重置尺寸选择
    sizeSelect.disabled = true;
    sizeSelect.innerHTML = '<option value="">请先选择款式</option>';
    document.getElementById('size-hint').innerHTML = '';
    document.getElementById('logo-style-section').style.display = 'none';
    document.getElementById('apply-all-btn').disabled = true;
    
    if (!style) {
        hint.innerHTML = '';
        return;
    }
    
    console.log(`[款式] 选择: ${style}`);
    
    // 从服务器获取尺寸选项
    try {
        hint.className = 'style-hint hint-info';
        hint.innerHTML = `正在加载 <strong>${style}</strong> 的尺寸选项...`;
        
        const response = await fetch('/api/logo/sizes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                platform: logoSettings.platform,
                style: style
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.sizes && data.sizes.length > 0) {
            sizeSelect.disabled = false;
            sizeSelect.innerHTML = '<option value="">请选择尺寸规格</option>';
            
            data.sizes.forEach(size => {
                const option = document.createElement('option');
                option.value = size;
                const spec = sizeSpecs[size];
                option.textContent = spec ? spec.displayName : size;
                sizeSelect.appendChild(option);
            });
            
            hint.className = 'style-hint hint-info';
            hint.innerHTML = `✓ 已加载 ${data.sizes.length} 个尺寸规格`;
        } else {
            hint.className = 'style-hint hint-warning';
            const errorMsg = data.error || '未知错误';
            hint.innerHTML = `⚠ 该款式暂无可用尺寸<br><small>错误: ${errorMsg}</small>`;
            console.error('[款式] 加载尺寸失败:', data);
        }
    } catch (error) {
        console.error('[款式] 加载尺寸失败:', error);
        hint.className = 'style-hint hint-warning';
        hint.innerHTML = `⚠ 加载尺寸失败，请重试<br><small>错误: ${error.message || error}</small>`;
    }
}

// 尺寸选择改变
async function onSizeChange() {
    const size = document.getElementById('size-select').value;
    const hint = document.getElementById('size-hint');
    
    logoSettings.size = size;
    logoSettings.logoPath = '';
    
    // 重置Logo颜色选择
    document.getElementById('logo-style-section').style.display = 'none';
    document.getElementById('apply-all-btn').disabled = true;
    
    if (!size) {
        hint.innerHTML = '';
        currentSizeRequirement = null;
        return;
    }
    
    console.log(`[尺寸] 选择: ${size}`);
    
    // 设置上传限制
    const spec = sizeSpecs[size];
    if (spec) {
        currentSizeRequirement = spec;
        hint.className = 'size-hint hint-info';
        hint.innerHTML = `<strong>✓ 上传限制已设置</strong><br>`;
        hint.innerHTML += `仅允许上传 <strong>${spec.name}</strong><br>`;
        hint.innerHTML += `上传图片将自动检测尺寸是否匹配`;
    }
    
    // 获取可用的Logo颜色选项
    try {
        const logos = await fetchLogoOptions(logoSettings.platform, logoSettings.style, size);
        
        if (logos.length > 0) {
            showLogoColorOptions(logos);
        } else {
            hint.className = 'size-hint hint-warning';
            hint.innerHTML += '<br>⚠ 该尺寸暂无可用Logo';
        }
    } catch (error) {
        console.error('[尺寸] 加载Logo失败:', error);
        hint.className = 'size-hint hint-warning';
        hint.innerHTML += '<br>⚠ 加载Logo失败，请重试';
    }
}

// 获取Logo选项（从服务器）
async function fetchLogoOptions(platform, style, size) {
    try {
        const response = await fetch('/api/logo/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                platform: platform,
                style: style,
                size: size
            })
        });
        
        const data = await response.json();
        return data.logos || [];
    } catch (error) {
        console.error('[API] 获取Logo列表失败:', error);
        return [];
    }
}

// 显示Logo样式选项（图片缩略图）
function showLogoColorOptions(logos) {
    const container = document.getElementById('logo-style-options');
    const section = document.getElementById('logo-style-section');
    
    container.innerHTML = '';
    
    if (logos.length === 0) {
        container.innerHTML = '<div class="logo-style-empty">暂无可用Logo</div>';
        section.style.display = 'block';
        return;
    }
    
    logos.forEach((logo, index) => {
        const item = document.createElement('div');
        item.className = 'logo-style-item';
        item.onclick = () => selectLogoStyle(logo, index);
        
        // Logo图片路径（通过Flask路由访问）
        const logoURL = `/${logo.path}`;
        
        // 解析颜色名称
        const colorName = logo.color || '默认';
        
        item.innerHTML = `
            <div class="logo-style-preview">
                <img src="${logoURL}" alt="${colorName}" class="logo-preview-img" loading="lazy">
                <div class="logo-style-overlay">
                    <svg viewBox="0 0 24 24" width="24" height="24" class="logo-check-icon">
                        <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                </div>
            </div>
            <div class="logo-style-label">${colorName}</div>
        `;
        
        // 默认选中第一个
        if (index === 0) {
            item.classList.add('active');
            selectLogoStyle(logos[0], 0);
        }
        
        container.appendChild(item);
    });
    
    section.style.display = 'block';
}

// 选择Logo样式
function selectLogoStyle(logo, index) {
    logoSettings.logoColor = logo.color || logo.name;
    logoSettings.logoPath = logo.path;
    
    // 更新选中状态
    document.querySelectorAll('.logo-style-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
    
    // 检查是否有符合尺寸的图片
    const matchingImages = uploadedImages.filter(img => img.specCheck.match);
    if (matchingImages.length === 0) {
        showNotification('提示：当前没有符合所选尺寸规格的图片，请先上传正确尺寸的图片', 'warning', 3000);
        document.getElementById('apply-all-btn').disabled = true;
        return;
    }
    
    // 启用应用按钮
    document.getElementById('apply-all-btn').disabled = false;
    
    // 立即在当前图片上预览
    if (currentImageIndex >= 0) {
        const img = uploadedImages[currentImageIndex];
        displayImageOnCanvas(img);
    }
    
    console.log(`[Logo] 选择样式: ${logoSettings.logoColor}, 路径: ${logoSettings.logoPath}`);
}

// 添加Logo到画布
function addLogoToCanvas(imgData, scale) {
    if (!logoSettings.logoPath) return;
    
    // ⚠️ 重要：Logo路径指向系统文件夹中的原始Logo文件（不是缩略图）
    // 例如：LOGO/天猫/普通款/800-800/800-A-白.png
    // 这是完整分辨率的Logo文件，确保最终合成效果清晰
    const logoURL = `/${logoSettings.logoPath}`;
    
    console.log(`[Logo预览] ========== 开始加载Logo ==========`);
    console.log(`[Logo预览] Logo文件路径: ${logoURL}`);
    console.log(`[Logo预览] ⚠️ 使用原始高清Logo文件（不是缩略图）`);
    console.log(`[Logo预览] 图片原始尺寸: ${imgData.width}x${imgData.height}`);
    console.log(`[Logo预览] 画布缩放比例: ${scale}`);
    console.log(`[Logo预览] Logo尺寸设置: ${logoSettings.logoSize}%（基于图片原始尺寸）`);
    console.log(`[Logo预览] 边距设置: X=${logoSettings.marginX}px, Y=${logoSettings.marginY}px`);
    
    fabric.Image.fromURL(logoURL, (logoImg) => {
        // 获取Logo的原始尺寸（这是系统文件中的实际尺寸）
        const logoOriginalWidth = logoImg.width;
        const logoOriginalHeight = logoImg.height;
        
        console.log(`[Logo预览] Logo原始尺寸（系统文件）: ${logoOriginalWidth}x${logoOriginalHeight}`);
        
        // 计算目标Logo尺寸（基于原图宽度的百分比）
        // ⚠️ 关键计算：Logo的大小是相对于原始图片尺寸的百分比
        // 例如：800x800图片，15%的Logo = 120x120像素（在实际800x800图片上）
        const targetLogoWidth = imgData.width * (logoSettings.logoSize / 100);
        // 保持Logo原始宽高比
        const targetLogoHeight = logoOriginalHeight * (targetLogoWidth / logoOriginalWidth);
        
        console.log(`[Logo预览] 计算后的Logo目标尺寸（在${imgData.width}x${imgData.height}图片上）: ${targetLogoWidth.toFixed(1)}x${targetLogoHeight.toFixed(1)}`);
        console.log(`[Logo预览] Logo占图片宽度的比例: ${logoSettings.logoSize}%`);
        
        // 计算在画布上的显示缩放
        // scale参数现在总是1（因为图片是100%显示）
        const scaleX = targetLogoWidth / logoOriginalWidth;
        const scaleY = targetLogoHeight / logoOriginalHeight;
        
        // 获取canvas容器尺寸
        const canvasWrapper = document.getElementById('canvas-wrapper');
        const containerWidth = canvasWrapper.clientWidth;
        const containerHeight = canvasWrapper.clientHeight;
        
        // 计算图片在画布上的位置（图片是居中的）
        const imgLeft = (containerWidth - imgData.width) / 2;
        const imgTop = (containerHeight - imgData.height) / 2;
        
        // Logo位置 = 图片位置 + 边距
        const logoLeft = imgLeft + logoSettings.marginX;
        const logoTop = imgTop + logoSettings.marginY;
        
        console.log(`[Logo预览] 画布显示缩放: scaleX=${scaleX.toFixed(4)}, scaleY=${scaleY.toFixed(4)}`);
        console.log(`[Logo预览] 图片位置: (${imgLeft.toFixed(1)}, ${imgTop.toFixed(1)})`);
        console.log(`[Logo预览] Logo位置: (${logoLeft.toFixed(1)}, ${logoTop.toFixed(1)})`);
        console.log(`[Logo预览] ⚠️ 注意：画布缩放仅用于预览，实际合成时使用原始尺寸`);
        
        logoImg.set({
            scaleX: scaleX,
            scaleY: scaleY,
            left: logoLeft,
            top: logoTop,
            selectable: true,  // 允许选中和拖动
            evented: true,      // 允许交互
            hasControls: true,  // 显示控制点
            hasBorders: true,   // 显示边框
            lockMovementX: false, // 允许水平移动
            lockMovementY: false, // 允许垂直移动
            lockScalingX: false, // 允许水平缩放
            lockScalingY: false, // 允许垂直缩放
            lockRotation: true,   // 锁定旋转（Logo通常不需要旋转）
            name: 'logo' // 设置名称以便识别
        });
        
        // 移除旧Logo（如果有）
        const oldLogo = canvas.getObjects().find(obj => obj.name === 'logo');
        if (oldLogo) {
            canvas.remove(oldLogo);
        }
        
        logoImg.name = 'logo';
        canvas.add(logoImg);
        canvas.bringToFront(logoImg);
        canvas.renderAll();
        
        console.log(`[Logo预览] ✓ Logo已添加到画布，预览完成`);
        console.log(`[Logo预览] ========================================`);
    }, { crossOrigin: 'anonymous' });
}

// Logo尺寸改变
function onLogoSizeChange(value) {
    logoSettings.logoSize = parseFloat(value);
    document.getElementById('logo-size-slider').value = value;
    document.getElementById('logo-size-input').value = value;
    
    // 更新预览
    if (currentImageIndex >= 0 && logoSettings.logoPath) {
        const img = uploadedImages[currentImageIndex];
        displayImageOnCanvas(img);
    }
}

// 边距改变
function onMarginChange() {
    logoSettings.marginX = parseFloat(document.getElementById('margin-x-input').value);
    logoSettings.marginY = parseFloat(document.getElementById('margin-y-input').value);
    
    // 更新预览
    if (currentImageIndex >= 0 && logoSettings.logoPath) {
        const img = uploadedImages[currentImageIndex];
        displayImageOnCanvas(img);
    }
}

// 应用到全部图片
async function applyToAll() {
    if (!logoSettings.logoPath) {
        showNotification('请先选择Logo款式和颜色', 'warning', 2000);
        return;
    }
    
    if (uploadedImages.length === 0) {
        showNotification('请先上传图片', 'warning', 2000);
        return;
    }
    
    const confirmed = confirm(`确定要将当前Logo设置应用到全部 ${uploadedImages.length} 张图片吗？`);
    if (!confirmed) return;
    
    showLoading('正在处理图片，请稍候...');
    
    try {
        // 批量处理
        const results = [];
        
        for (let i = 0; i < uploadedImages.length; i++) {
            const img = uploadedImages[i];
            console.log(`[批量] 处理第 ${i + 1}/${uploadedImages.length} 张`);
            
            // 更新进度
            updateLoadingText(`处理第 ${i + 1}/${uploadedImages.length} 张图片...`);
            
            // 调用后端API合成
            const result = await composeLogo(img, logoSettings);
            
            if (result.success) {
                img.hasLogo = true;
                img.resultDataURL = result.imageURL;
                results.push(result);
            }
        }
        
        hideLoading();
        
        showNotification(`✓ 成功处理 ${results.length}/${uploadedImages.length} 张图片！\n\n现在可以点击"下载当前"下载单张，或"批量导出ZIP"下载全部。`, 'success', 3000);
        
        // 刷新预览
        if (currentImageIndex >= 0) {
            selectImage(currentImageIndex);
        }
        
        // 更新下载按钮状态
        updateDownloadButton();
        
    } catch (error) {
        hideLoading();
        console.error('[批量] 处理失败:', error);
        showNotification('批量处理失败：' + error.message, 'error', 3000);
    }
}

// 合成Logo（调用后端API）
async function composeLogo(imgData, settings) {
    try {
        const response = await fetch('/api/logo/compose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: imgData.dataURL,
                logoPath: settings.logoPath,
                logoSize: settings.logoSize,
                marginX: settings.marginX,
                marginY: settings.marginY,
                imageWidth: imgData.width,
                imageHeight: imgData.height
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            return { success: true, imageURL: data.result_url };
        } else {
            throw new Error(data.error || '合成失败');
        }
    } catch (error) {
        console.error('[API] Logo合成失败:', error);
        return { success: false, error: error.message };
    }
}

// 批量导出ZIP
async function exportAll() {
    if (uploadedImages.length === 0) {
        showNotification('请先上传图片', 'warning', 2000);
        return;
    }
    
    // 检查是否有图片未处理
    const unprocessed = uploadedImages.filter(img => !img.hasLogo);
    if (unprocessed.length > 0) {
        const proceed = confirm(`有 ${unprocessed.length} 张图片尚未添加Logo，是否仍要导出？\n\n提示：点击"应用到全部图片"后再导出。`);
        if (!proceed) return;
    }
    
    showLoading('正在打包下载，请稍候...');
    
    try {
        // 准备导出数据
        const exportData = uploadedImages.map(img => ({
            name: img.name,
            imageURL: img.hasLogo ? img.resultDataURL : img.dataURL
        }));
        
        // 调用后端API生成ZIP
        const response = await fetch('/api/logo/export-zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images: exportData })
        });
        
        if (!response.ok) {
            throw new Error('导出失败');
        }
        
        // 下载ZIP
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logo_images_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        hideLoading();
        showNotification('✓ 导出成功！', 'success', 2000);
        
    } catch (error) {
        hideLoading();
        console.error('[导出] 失败:', error);
        showNotification('导出失败：' + error.message, 'error', 3000);
    }
}

// 重置所有
function resetAll() {
    if (uploadedImages.length === 0) return;
    
    const confirmed = confirm('确定要清空所有图片和设置吗？');
    if (!confirmed) return;
    
    uploadedImages = [];
    currentImageIndex = -1;
    logoSettings = {
        platform: '',
        style: '',
        size: '',
        logoColor: '',
        logoSize: 100,
        marginX: 20,
        marginY: 20,
        logoPath: ''
    };
    
    currentSizeRequirement = null;
    
    canvas.clear();
    updateImageList();
    updateImageCount();
    
    document.getElementById('platform-select').value = '';
    document.getElementById('style-select').value = '';
    document.getElementById('style-select').disabled = true;
    document.getElementById('size-select').value = '';
    document.getElementById('size-select').disabled = true;
    document.getElementById('platform-hint').innerHTML = '';
    document.getElementById('style-hint').innerHTML = '';
    document.getElementById('size-hint').innerHTML = '';
    document.getElementById('logo-style-section').style.display = 'none';
    document.getElementById('canvas-placeholder').style.display = 'flex';
    document.getElementById('export-btn').disabled = true;
    document.getElementById('apply-all-btn').disabled = true;
    document.getElementById('download-current-btn').disabled = true;
    
    console.log('[重置] 已清空所有数据');
}

// 获取产品图片的中心点（用于缩放基准）
function getProductImageCenter() {
    const productImg = canvas.getObjects().find(o => o.name === 'product-image');
    if (productImg) {
        // 获取图片的中心点（考虑当前的left和top位置，以及缩放后的实际尺寸）
        const centerX = productImg.left + (productImg.width * productImg.scaleX) / 2;
        const centerY = productImg.top + (productImg.height * productImg.scaleY) / 2;
        return new fabric.Point(centerX, centerY);
    }
    // 如果没有图片，则使用画布中心
    return new fabric.Point(canvas.width / 2, canvas.height / 2);
}

// 缩放控制
function zoomIn() {
    const zoom = canvas.getZoom();
    const newZoom = Math.min(zoom * 1.2, 5); // 最大5倍
    
    // 以图片中心为基准点进行缩放
    const center = getProductImageCenter();
    canvas.zoomToPoint(center, newZoom);
    
    updateZoomLevel();
    canvas.renderAll();
}

function zoomOut() {
    const zoom = canvas.getZoom();
    const newZoom = Math.max(zoom * 0.8, 0.1); // 最小0.1倍
    
    // 以图片中心为基准点进行缩放
    const center = getProductImageCenter();
    canvas.zoomToPoint(center, newZoom);
    
    updateZoomLevel();
    canvas.renderAll();
}

function resetZoom() {
    // 以图片中心为基准点重置缩放
    const center = getProductImageCenter();
    canvas.zoomToPoint(center, 1); // 重置为100%（原大小）
    
    updateZoomLevel();
    canvas.renderAll();
}

function updateZoomLevel() {
    const zoom = Math.round(canvas.getZoom() * 100);
    const zoomInput = document.getElementById('zoom-level');
    if (zoomInput) {
        zoomInput.value = `${zoom}%`;
    }
}

// 设置缩放比例（通过手动输入）
function setZoomByInput() {
    const zoomInput = document.getElementById('zoom-level');
    if (!zoomInput) return;
    
    let value = zoomInput.value.trim();
    
    // 移除百分号
    if (value.endsWith('%')) {
        value = value.slice(0, -1);
    }
    
    // 转换为数字
    const zoomPercent = parseFloat(value);
    
    // 验证输入
    if (isNaN(zoomPercent) || zoomPercent < 10 || zoomPercent > 500) {
        // 输入无效，恢复当前值
        updateZoomLevel();
        return;
    }
    
    // 转换为缩放比例（0.1 到 5）
    const newZoom = zoomPercent / 100;
    
    // 以图片中心为基准点进行缩放
    const center = getProductImageCenter();
    canvas.zoomToPoint(center, newZoom);
    
    updateZoomLevel();
    canvas.renderAll();
}

// Loading相关
function showLoading(text = '处理中...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function updateLoadingText(text) {
    document.getElementById('loading-text').textContent = text;
}

// ==========================================
// 通知提示函数
// ==========================================
function showNotification(message, type = 'info', duration = 2000) {
    // 移除已存在的通知
    const existingNotification = document.querySelector('.notification-modal');
    const existingOverlay = document.querySelector('.notification-overlay');
    if (existingNotification) {
        existingNotification.remove();
    }
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'notification-overlay';
    
    // 创建弹窗
    const notification = document.createElement('div');
    notification.className = `notification-modal notification-${type}`;
    
    // 根据类型设置图标
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✗';
    if (type === 'warning') icon = '⚠';
    
    notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-message-text">${message}</div>
    `;
    
    // 添加到页面
    document.body.appendChild(overlay);
    document.body.appendChild(notification);
    
    // 触发动画
    requestAnimationFrame(() => {
        notification.classList.add('notification-show');
        overlay.classList.add('notification-show');
    });
    
    // 自动移除
    setTimeout(() => {
        notification.classList.remove('notification-show');
        overlay.classList.remove('notification-show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
            if (overlay.parentNode) {
                overlay.remove();
            }
        }, 250);
    }, duration);
}

// 更新下载按钮状态
function updateDownloadButton() {
    const downloadBtn = document.getElementById('download-current-btn');
    if (!downloadBtn) return;
    
    // 检查当前图片是否已处理（有Logo）
    if (currentImageIndex >= 0 && currentImageIndex < uploadedImages.length) {
        const img = uploadedImages[currentImageIndex];
        // 如果图片已处理（有resultDataURL），启用下载按钮
        downloadBtn.disabled = !img.hasLogo;
    } else {
        downloadBtn.disabled = true;
    }
}

// 下载当前预览的图片
async function downloadCurrentImage() {
    if (currentImageIndex < 0 || currentImageIndex >= uploadedImages.length) {
        showNotification('请先选择一张图片', 'warning', 2000);
        return;
    }
    
    const img = uploadedImages[currentImageIndex];
    
    // 检查是否已处理
    if (!img.hasLogo || !img.resultDataURL) {
        showNotification('当前图片尚未添加Logo，请先点击"应用到全部图片"', 'warning', 3000);
        return;
    }
    
    try {
        console.log(`[下载] 开始下载图片: ${img.name}`);
        
        // 如果resultDataURL是base64格式
        if (img.resultDataURL.startsWith('data:image')) {
            // 从base64提取数据
            const base64Data = img.resultDataURL.split(',')[1];
            const binaryData = atob(base64Data);
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
                bytes[i] = binaryData.charCodeAt(i);
            }
            
            // 创建Blob
            const blob = new Blob([bytes], { type: 'image/jpeg' });
            const url = window.URL.createObjectURL(blob);
            
            // 创建下载链接
            const a = document.createElement('a');
            a.href = url;
            
            // 生成文件名（保留原文件名，添加_logo后缀）
            const originalName = img.name.replace(/\.[^/.]+$/, ''); // 移除扩展名
            const extension = img.name.match(/\.[^/.]+$/) ? img.name.match(/\.[^/.]+$/)[0] : '.jpg';
            a.download = `${originalName}_logo${extension}`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // 释放URL
            window.URL.revokeObjectURL(url);
            
            showNotification(`✓ 下载成功: ${a.download}`, 'success', 2000);
        } else {
            // 如果是URL格式，直接下载
            const a = document.createElement('a');
            a.href = img.resultDataURL;
            const originalName = img.name.replace(/\.[^/.]+$/, '');
            const extension = img.name.match(/\.[^/.]+$/) ? img.name.match(/\.[^/.]+$/)[0] : '.jpg';
            a.download = `${originalName}_logo${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            showNotification(`✓ 下载成功: ${a.download}`, 'success', 2000);
        }
        
        console.log(`[下载] ✓ 下载完成`);
        
    } catch (error) {
        console.error('[下载] 下载失败:', error);
        showNotification('下载失败：' + error.message, 'error', 3000);
    }
}

console.log('[Logo编辑器] 脚本加载完成');

