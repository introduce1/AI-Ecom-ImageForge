// ==========================================
// 文字编辑功能 - JavaScript
// 使用 Fabric.js 实现 Canvas 编辑
// ==========================================

// 全局变量
let teCanvas = null;  // Fabric.js canvas 实例
let teBackgroundImage = null;  // 背景图片对象
let teTextBoxes = [];  // 所有文本框对象
let teHistory = [];  // 历史记录（用于撤销）
let teHistoryStep = -1;  // 当前历史步骤
let teSelectedTextBox = null;  // 当前选中的文本框
let teOriginalImageData = null;  // 原始图片数据（用于应用时提交）
let teInitialized = false;  // 标记是否已初始化

// 画布缩放和拖拽相关
let teZoom = 1;  // 当前缩放比例
let teIsPanning = false;  // 是否正在拖拽
let teLastPosX = 0;  // 上次鼠标位置
let teLastPosY = 0;

// 悬浮删除按钮相关
let teDeleteButton = null;  // 删除按钮元素
let teHoveredObject = null;  // 当前悬浮的对象

// 颜色选择器相关
let teColorPickerVisible = false;  // 颜色选择器是否显示
let teCurrentColorTarget = null;  // 当前正在选择颜色的目标（'text' 或 其他）

// 文字提取工具相关
let teIsSelecting = false;  // 是否正在选择区域
let teSelectionRect = null;  // 选择的矩形对象
let teSelectionStartX = 0;  // 选择起点
let teSelectionStartY = 0;

// 文字去除工具相关
let teIsRemoving = false;  // 是否正在文字去除模式
let teRemovalRect = null;  // 文字去除的矩形对象
let teRemovalStartX = 0;  // 文字去除起点
let teRemovalStartY = 0;

// ==========================================
// 初始化
// ==========================================
function initTextEditor() {
    // 如果已经初始化，先清理
    if (teCanvas) {
        teCanvas.dispose();
        teCanvas = null;
    }
    
    console.log('[文字编辑] 初始化...');
    
    // 初始化 Fabric.js Canvas
    const canvasEl = document.getElementById('te-canvas');
    if (!canvasEl) {
        console.error('[文字编辑] Canvas 元素未找到');
        return;
    }
    
    try {
        // 获取容器尺寸，设置Canvas初始尺寸
        const canvasWrapper = document.getElementById('te-canvas-wrapper');
        const initialWidth = canvasWrapper ? Math.max(canvasWrapper.clientWidth, 1200) : 1200;
        const initialHeight = canvasWrapper ? Math.max(canvasWrapper.clientHeight, 800) : 800;
        
        teCanvas = new fabric.Canvas('te-canvas', {
            width: initialWidth,
            height: initialHeight,
            backgroundColor: '#f5f5f5',
            selection: true,
            preserveObjectStacking: true
        });
        
        // 监听对象选中事件
        teCanvas.on('selection:created', handleTextSelection);
        teCanvas.on('selection:updated', handleTextSelection);
        teCanvas.on('selection:cleared', handleTextDeselection);
        
        // 监听对象修改事件（用于历史记录）
        teCanvas.on('object:modified', saveHistory);
        teCanvas.on('object:added', saveHistory);
        teCanvas.on('object:removed', saveHistory);
        
        // 监听文本框内容变化
        teCanvas.on('text:changed', handleTextChanged);
        
        // 初始化画布缩放和拖拽功能
        initCanvasZoomAndPan();
        
        // 初始化删除按钮
        initDeleteButton();
        
        // 更新缩放显示
        updateZoomDisplay();
        
        // 监听窗口大小变化，调整Canvas尺寸
        window.addEventListener('resize', function() {
            if (teCanvas && !teBackgroundImage) {
                // 只有在没有图片时才调整Canvas尺寸（有图片时保持图片尺寸）
                const canvasWrapper = document.getElementById('te-canvas-wrapper');
                if (canvasWrapper) {
                    const newWidth = Math.max(canvasWrapper.clientWidth, 1200);
                    const newHeight = Math.max(canvasWrapper.clientHeight, 800);
                    teCanvas.setDimensions({ width: newWidth, height: newHeight });
                }
            }
        });
        
        teInitialized = true;
        console.log('[文字编辑] ✅ 初始化完成，Canvas尺寸:', initialWidth, 'x', initialHeight);
    } catch (error) {
        console.error('[文字编辑] 初始化失败:', error);
        teInitialized = false;
    }
}

// ==========================================
// 图片上传和OCR识别
// ==========================================
function handleTextEditorImageUpload(input) {
    const file = input.files[0];
    if (!file) return;
    
    console.log('[文字编辑] 上传图片:', file.name);
    
    // 如果是替换图片，先清除旧的文本框和OCR数据
    if (teBackgroundImage) {
        console.log('[文字编辑] 检测到已有图片，先清除旧数据...');
        // 清空所有文本框
        teTextBoxes.forEach(box => {
            if (teCanvas) teCanvas.remove(box);
        });
        teTextBoxes = [];
        // 清空文本列表
        const textList = document.getElementById('te-text-list');
        if (textList) {
            textList.innerHTML = '';
        }
        document.getElementById('te-text-count').textContent = '0个';
    }
    
    // 隐藏上传提示（不再显示加载状态，因为不再自动OCR）
    const emptyState = document.getElementById('te-empty-state');
    if (emptyState) {
        emptyState.style.display = 'none';
    }
    
    // 读取图片
    const reader = new FileReader();
    reader.onload = function(e) {
        const imageDataUrl = e.target.result;
        teOriginalImageData = imageDataUrl;
        
        // 在 Canvas 上显示图片
        fabric.Image.fromURL(imageDataUrl, function(img) {
            // 清空 Canvas（如果是替换图片）
            if (teBackgroundImage) {
                teCanvas.clear();
            }
            
            // 获取容器尺寸
            const canvasWrapper = document.getElementById('te-canvas-wrapper');
            const containerWidth = canvasWrapper ? canvasWrapper.clientWidth : 1200;
            const containerHeight = canvasWrapper ? canvasWrapper.clientHeight : 800;
            
            // Canvas 保持一个合理的显示尺寸（使用容器尺寸或图片尺寸的较大值）
            // 但至少保持容器大小，确保显示区域足够大
            const canvasWidth = Math.max(containerWidth, img.width);
            const canvasHeight = Math.max(containerHeight, img.height);
            
            // 设置 Canvas 尺寸（保持较大的显示区域）
            teCanvas.setDimensions({
                width: canvasWidth,
                height: canvasHeight
            });
            
            // 计算图片缩放比例，使其适应Canvas
            const scaleX = canvasWidth / img.width;
            const scaleY = canvasHeight / img.height;
            const scale = Math.min(scaleX, scaleY, 1); // 不超过100%，保持图片清晰
            
            // 设置背景图片（缩放以适应Canvas）
            img.set({
                scaleX: scale,
                scaleY: scale,
                selectable: false,
                evented: false,
                left: (canvasWidth - img.width * scale) / 2,
                top: (canvasHeight - img.height * scale) / 2
            });
            
            teCanvas.setBackgroundImage(img, teCanvas.renderAll.bind(teCanvas));
            teBackgroundImage = img;
            
            // 保存图片的原始尺寸和缩放信息（用于OCR坐标转换）
            teBackgroundImage._originalWidth = img.width;
            teBackgroundImage._originalHeight = img.height;
            teBackgroundImage._scale = scale;
            teBackgroundImage._offsetX = (canvasWidth - img.width * scale) / 2;
            teBackgroundImage._offsetY = (canvasHeight - img.height * scale) / 2;
            
            console.log('[文字编辑] 图片已加载到 Canvas');
            console.log('  图片原始尺寸:', img.width, 'x', img.height);
            console.log('  Canvas尺寸:', canvasWidth, 'x', canvasHeight);
            console.log('  缩放比例:', scale);
            
            // 显示图片控制区域
            showImageControl(file, imageDataUrl);
            
            // 重置视口并适应屏幕
            resetZoom();
            setTimeout(() => fitToScreen(), 100);
            
            // 隐藏加载状态（不再自动OCR识别）
            document.getElementById('te-canvas-loading').style.display = 'none';
            
            console.log('[文字编辑] 图片已加载，请使用"文字提取"工具选择区域进行识别');
        });
    };
    
    reader.readAsDataURL(file);
}

// 显示图片控制区域
function showImageControl(file, imageDataUrl) {
    const imageControl = document.getElementById('te-image-control');
    const imagePreview = document.getElementById('te-image-preview');
    
    if (!imageControl || !imagePreview) return;
    
    // 显示控制区域
    imageControl.style.display = 'block';
    
    // 创建预览
    imagePreview.innerHTML = `
        <img src="${imageDataUrl}" alt="${file.name}" class="image-preview-thumb">
        <div class="image-preview-info">
            <div class="image-preview-name" title="${file.name}">${file.name}</div>
            <div class="image-preview-size">${(file.size / 1024).toFixed(1)} KB</div>
        </div>
    `;
}

// 删除图片
function removeTextEditorImage() {
    if (!confirm('确定要删除当前图片吗？删除后所有编辑内容将清空。')) {
        return;
    }
    
    // 清空 Canvas
    if (teCanvas) {
        teCanvas.clear();
        teCanvas.setBackgroundColor('#f5f5f5', teCanvas.renderAll.bind(teCanvas));
        
        // 重置Canvas尺寸为容器大小
        const canvasWrapper = document.getElementById('te-canvas-wrapper');
        const resetWidth = canvasWrapper ? Math.max(canvasWrapper.clientWidth, 1200) : 1200;
        const resetHeight = canvasWrapper ? Math.max(canvasWrapper.clientHeight, 800) : 800;
        teCanvas.setDimensions({ width: resetWidth, height: resetHeight });
    }
    
    // 清空所有文本框
    teTextBoxes.forEach(box => {
        if (teCanvas) teCanvas.remove(box);
    });
    teTextBoxes = [];
    
    // 清空数据
    teBackgroundImage = null;
    teOriginalImageData = null;
    teSelectedTextBox = null;
    
    // 清空历史记录
    teHistory = [];
    teHistoryStep = -1;
    
    // 更新 UI - 恢复上传提示
    document.getElementById('te-image-control').style.display = 'none';
    
    // 恢复原始的上传提示（重新创建，因为可能被 updateTextList 删除了）
    const textList = document.getElementById('te-text-list');
    textList.innerHTML = `
        <div class="empty-state" id="te-empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" style="opacity: 0.3;"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            <p>上传图片开始编辑</p>
            <button class="upload-trigger-btn" onclick="document.getElementById('te-image-input').click()">选择图片</button>
            <p style="font-size: 12px; color: #999; margin-top: 8px;">上传后，使用"文字提取"工具选择区域识别文字</p>
        </div>
    `;
    
    document.getElementById('te-text-count').textContent = '0个';
    document.getElementById('te-apply-btn').disabled = true;
    document.getElementById('te-undo-btn').disabled = true;
    document.getElementById('te-redo-btn').disabled = true;
    
    // 隐藏顶部工具栏样式控件
    document.getElementById('te-toolbar-style-controls').style.display = 'none';
    document.getElementById('te-style-divider').style.display = 'none';
    
    // 重置缩放
    resetZoom();
    
    // 清空文件输入
    const fileInput = document.getElementById('te-image-input');
    if (fileInput) {
        fileInput.value = '';
    }
    
    console.log('[文字编辑] 图片已删除，画布已清空，OCR文字已清除');
}

// 注意：此函数已不再自动调用
// 现在使用区域选择工具（extractTextFromRegion）进行选择性识别
// 保留此函数以备将来需要整图识别时使用
function recognizeText(file) {
    console.log('[文字编辑] 开始 OCR 识别（整图识别）...');
    
    const formData = new FormData();
    formData.append('image', file);
    
    fetch('/api/text-recognition', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        console.log('[文字编辑] OCR 响应:', data);
        
        // 隐藏加载状态
        document.getElementById('te-canvas-loading').style.display = 'none';
        
        if (data.success) {
            console.log(`[文字编辑] ✅ 识别到 ${data.textRegions.length} 个文字区域`);
            
            // 在 Canvas 上创建文本框
            createTextBoxesFromOCR(data.textRegions);
            
            // 更新左侧文本列表
            updateTextList();
            
            // 启用应用按钮
            document.getElementById('te-apply-btn').disabled = false;
            
            // 保存初始状态
            saveHistory();
        } else {
            showNotification('文字识别失败: ' + (data.error || '未知错误'), 'error', 3000);
        }
    })
    .catch(error => {
        console.error('[文字编辑] OCR 错误:', error);
        document.getElementById('te-canvas-loading').style.display = 'none';
        showNotification('文字识别失败: ' + error.message, 'error', 3000);
    });
}

function createTextBoxesFromOCR(textRegions) {
    console.log('[文字编辑] 创建文本框...');
    
    // 清空现有文本框
    teTextBoxes.forEach(box => teCanvas.remove(box));
    teTextBoxes = [];
    
    // 获取图片的缩放和偏移信息
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    
    if (teBackgroundImage && teBackgroundImage._scale) {
        scale = teBackgroundImage._scale;
        offsetX = teBackgroundImage._offsetX || 0;
        offsetY = teBackgroundImage._offsetY || 0;
    }
    
    // 为每个识别区域创建文本框
    textRegions.forEach((region, index) => {
        // 将OCR坐标（基于原始图片）转换为Canvas坐标
        const canvasX = offsetX + region.x * scale;
        const canvasY = offsetY + region.y * scale;
        const canvasWidth = region.width * scale;
        const canvasHeight = region.height * scale;
        
        const textBox = new fabric.Textbox(region.text, {
            left: canvasX,
            top: canvasY,
            width: canvasWidth,
            fontSize: Math.max(12, canvasHeight * 0.6), // 根据Canvas高度估算字号
            fill: '#000000',
            fontFamily: 'MiSans',
            textAlign: 'left',
            editable: true,
            hasControls: true,
            hasBorders: true,
            borderColor: '#2196F3',
            cornerColor: '#2196F3',
            cornerSize: 8,
            transparentCorners: false,
            lockRotation: false,
            // 自定义属性
            regionId: region.id,
            confidence: region.confidence,
            // 保存原始OCR坐标（用于后续处理）
            _originalX: region.x,
            _originalY: region.y,
            _originalWidth: region.width,
            _originalHeight: region.height
        });
        
        teCanvas.add(textBox);
        teTextBoxes.push(textBox);
    });
    
    teCanvas.renderAll();
    console.log(`[文字编辑] ✅ 创建了 ${teTextBoxes.length} 个文本框`);
    console.log(`[文字编辑] 坐标转换: scale=${scale}, offset=(${offsetX}, ${offsetY})`);
}

// ==========================================
// 左侧文本列表
// ==========================================
function updateTextList() {
    const listContainer = document.getElementById('te-text-list');
    listContainer.innerHTML = '';
    
    if (teTextBoxes.length === 0) {
        // 如果有图片但没有文字，显示"未识别到文字"
        // 如果没有图片，显示上传提示（这个会在 removeTextEditorImage 中处理）
        if (teBackgroundImage) {
            listContainer.innerHTML = '<div class="empty-state"><p>未识别到文字</p></div>';
        } else {
            // 没有图片时，恢复上传提示
            listContainer.innerHTML = `
                <div class="empty-state" id="te-empty-state">
                    <svg viewBox="0 0 24 24" width="48" height="48" style="opacity: 0.3;"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                    <p>上传图片开始编辑</p>
                    <button class="upload-trigger-btn" onclick="document.getElementById('te-image-input').click()">选择图片</button>
                </div>
            `;
        }
        document.getElementById('te-text-count').textContent = '0个';
        return;
    }
    
    document.getElementById('te-text-count').textContent = `${teTextBoxes.length}个`;
    
    teTextBoxes.forEach((textBox, index) => {
        const item = document.createElement('div');
        item.className = 'text-list-item';
        item.dataset.index = index;
        
        item.innerHTML = `
            <div class="text-item-header">
                <span class="text-item-number">${index + 1}</span>
                <span class="text-item-confidence">${Math.round(textBox.confidence * 100)}%</span>
            </div>
            <textarea class="text-item-input" rows="2" placeholder="输入文字...">${textBox.text}</textarea>
        `;
        
        // 点击项时选中对应的文本框
        item.addEventListener('click', function(e) {
            if (e.target.tagName !== 'TEXTAREA') {
                selectTextBox(index);
            }
        });
        
        // 文本框输入时同步到 Canvas
        const textarea = item.querySelector('.text-item-input');
        textarea.addEventListener('input', function() {
            textBox.set('text', this.value);
            teCanvas.renderAll();
        });
        
        listContainer.appendChild(item);
    });
}

function selectTextBox(index) {
    if (index < 0 || index >= teTextBoxes.length) return;
    
    const textBox = teTextBoxes[index];
    teCanvas.setActiveObject(textBox);
    teCanvas.renderAll();
    
    // 高亮左侧列表项
    document.querySelectorAll('.text-list-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
}

// ==========================================
// 右侧样式工具栏
// ==========================================
function handleTextSelection(e) {
    const activeObject = teCanvas.getActiveObject();
    
    if (!activeObject || activeObject.type !== 'textbox') {
        handleTextDeselection();
        return;
    }
    
    teSelectedTextBox = activeObject;
    
    // 显示顶部工具栏样式控件
    document.getElementById('te-toolbar-style-controls').style.display = 'flex';
    document.getElementById('te-style-divider').style.display = 'block';
    
    // 更新样式控件的值
    document.getElementById('te-font-family').value = activeObject.fontFamily || 'MiSans';
    document.getElementById('te-font-size-input').value = activeObject.fontSize || 16;
    document.getElementById('te-text-color').value = activeObject.fill || '#000000';
    document.getElementById('te-text-color-hex').value = activeObject.fill || '#000000';
    document.getElementById('te-char-spacing').value = activeObject.charSpacing || 0;
    document.getElementById('te-char-spacing-val').textContent = activeObject.charSpacing || 0;
    document.getElementById('te-line-height').value = activeObject.lineHeight || 1.2;
    document.getElementById('te-line-height-val').textContent = (activeObject.lineHeight || 1.2).toFixed(1);
    
    // 更新对齐按钮
    document.querySelectorAll('.align-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.align === activeObject.textAlign);
    });
    
    // 高亮左侧对应项
    const index = teTextBoxes.indexOf(activeObject);
    if (index >= 0) {
        document.querySelectorAll('.text-list-item').forEach((item, i) => {
            item.classList.toggle('active', i === index);
        });
    }
}

function handleTextDeselection() {
    teSelectedTextBox = null;
    
    // 隐藏顶部工具栏样式控件
    document.getElementById('te-toolbar-style-controls').style.display = 'none';
    document.getElementById('te-style-divider').style.display = 'none';
    
    // 取消左侧列表项高亮
    document.querySelectorAll('.text-list-item').forEach(item => {
        item.classList.remove('active');
    });
}

function updateTextStyle(property, value) {
    if (!teSelectedTextBox) return;
    
    console.log(`[文字编辑] 更新样式: ${property} = ${value}`);
    
    // 更新文本框样式
    if (property === 'fontSize') {
        teSelectedTextBox.set(property, parseInt(value));
        document.getElementById('te-font-size-input').value = value;
    } else if (property === 'fill') {
        teSelectedTextBox.set(property, value);
        document.getElementById('te-text-color').value = value;
        document.getElementById('te-text-color-hex').value = value;
    } else if (property === 'charSpacing') {
        teSelectedTextBox.set(property, parseInt(value));
        document.getElementById('te-char-spacing-val').textContent = value;
    } else if (property === 'lineHeight') {
        teSelectedTextBox.set(property, parseFloat(value));
        document.getElementById('te-line-height-val').textContent = parseFloat(value).toFixed(1);
    } else if (property === 'textAlign') {
        teSelectedTextBox.set(property, value);
        document.querySelectorAll('.align-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.align === value);
        });
    } else {
        teSelectedTextBox.set(property, value);
    }
    
    teCanvas.renderAll();
    saveHistory();
}

function handleTextChanged(e) {
    // 文本内容改变时，同步到左侧列表
    const textBox = e.target;
    const index = teTextBoxes.indexOf(textBox);
    
    if (index >= 0) {
        const listItem = document.querySelector(`.text-list-item[data-index="${index}"]`);
        if (listItem) {
            const textarea = listItem.querySelector('.text-item-input');
            if (textarea && textarea !== document.activeElement) {
                textarea.value = textBox.text;
            }
        }
    }
}

// ==========================================
// 撤销/重做
// ==========================================
function saveHistory() {
    // 检查是否在文字编辑器页面，且Canvas已初始化
    if (!teCanvas || typeof teCanvas.toJSON !== 'function') {
        // 如果不在文字编辑器页面，不执行保存操作
        // 这可能是其他页面调用了同名的saveHistory函数
        return;
    }
    
    // 保存当前状态
    const state = JSON.stringify(teCanvas.toJSON(['regionId', 'confidence']));
    
    // 如果不是在历史末尾，删除后面的历史
    if (teHistoryStep < teHistory.length - 1) {
        teHistory = teHistory.slice(0, teHistoryStep + 1);
    }
    
    teHistory.push(state);
    teHistoryStep = teHistory.length - 1;
    
    // 更新按钮状态
    updateHistoryButtons();
}

function textEditorUndo() {
    if (teHistoryStep <= 0) return;
    
    teHistoryStep--;
    loadHistoryState(teHistory[teHistoryStep]);
    updateHistoryButtons();
}

function textEditorRedo() {
    if (teHistoryStep >= teHistory.length - 1) return;
    
    teHistoryStep++;
    loadHistoryState(teHistory[teHistoryStep]);
    updateHistoryButtons();
}

function loadHistoryState(state) {
    teCanvas.loadFromJSON(state, function() {
        teCanvas.renderAll();
        
        // 重新收集文本框
        teTextBoxes = teCanvas.getObjects().filter(obj => obj.type === 'textbox');
        
        // 更新左侧列表
        updateTextList();
    });
}

function updateHistoryButtons() {
    document.getElementById('te-undo-btn').disabled = teHistoryStep <= 0;
    document.getElementById('te-redo-btn').disabled = teHistoryStep >= teHistory.length - 1;
}

// ==========================================
// 插入功能
// ==========================================
function insertTextBox() {
    console.log('[文字编辑] 插入文本框');
    
    const textBox = new fabric.Textbox('新文本', {
        left: teCanvas.width / 2 - 50,
        top: teCanvas.height / 2 - 20,
        width: 150,
        fontSize: 24,
        fill: '#000000',
        fontFamily: 'Microsoft YaHei',
        textAlign: 'left',
        editable: true,
        hasControls: true,
        hasBorders: true,
        borderColor: '#2196F3',
        cornerColor: '#2196F3',
        cornerSize: 8,
        transparentCorners: false,
        regionId: `inserted_${Date.now()}`,
        confidence: 1.0
    });
    
    teCanvas.add(textBox);
    teTextBoxes.push(textBox);
    teCanvas.setActiveObject(textBox);
    teCanvas.renderAll();
    
    updateTextList();
    saveHistory();
}

function insertImage() {
    console.log('[文字编辑] 插入图片');
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            fabric.Image.fromURL(event.target.result, function(img) {
                // 限制插入图片的大小
                const maxSize = 300;
                const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
                
                img.set({
                    left: teCanvas.width / 2 - (img.width * scale) / 2,
                    top: teCanvas.height / 2 - (img.height * scale) / 2,
                    scaleX: scale,
                    scaleY: scale
                });
                
                teCanvas.add(img);
                teCanvas.setActiveObject(img);
                teCanvas.renderAll();
                
                saveHistory();
            });
        };
        
        reader.readAsDataURL(file);
    };
    
    input.click();
}

// ==========================================
// 应用修改（AI融合）
// ==========================================
function applyTextEdits() {
    console.log('[文字编辑] 应用修改...');
    
    if (!teOriginalImageData) {
        showNotification('请先上传图片', 'warning', 2000);
        return;
    }
    
    // 获取原始图片尺寸
    let originalWidth = 0;
    let originalHeight = 0;
    
    if (teBackgroundImage && teBackgroundImage._originalWidth) {
        originalWidth = teBackgroundImage._originalWidth;
        originalHeight = teBackgroundImage._originalHeight;
    }
    
    console.log('[文字编辑] 原图尺寸:', originalWidth, 'x', originalHeight);
    
    // 获取缩放和偏移信息
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    
    if (teBackgroundImage && teBackgroundImage._scale) {
        scale = teBackgroundImage._scale;
        offsetX = teBackgroundImage._offsetX || 0;
        offsetY = teBackgroundImage._offsetY || 0;
    }
    
    console.log('[文字编辑] Canvas缩放信息: scale=', scale, ', offset=(', offsetX, ',', offsetY, ')');
    
    // 收集所有编辑信息，并转换为原图坐标
    const edits = [];
    const insertions = [];
    
    teCanvas.getObjects().forEach(obj => {
        if (obj.type === 'textbox') {
            // Canvas坐标转换为原图坐标
            const canvasLeft = obj.left;
            const canvasTop = obj.top;
            const canvasWidth = obj.width * obj.scaleX;
            const canvasHeight = obj.height * obj.scaleY;
            
            // 转换到原图坐标系
            const originalX = Math.round((canvasLeft - offsetX) / scale);
            const originalY = Math.round((canvasTop - offsetY) / scale);
            const originalW = Math.round(canvasWidth / scale);
            const originalH = Math.round(canvasHeight / scale);
            
            console.log('[文字编辑] 文本框坐标转换:');
            console.log('  Canvas: (', canvasLeft, ',', canvasTop, '), 大小:', canvasWidth, 'x', canvasHeight);
            console.log('  原图: (', originalX, ',', originalY, '), 大小:', originalW, 'x', originalH);
            
            const data = {
                id: obj.regionId || `text_${Date.now()}`,
                type: 'text',
                content: obj.text,
                x: originalX,
                y: originalY,
                width: originalW,
                height: originalH,
                styles: {
                    fontFamily: obj.fontFamily,
                    fontSize: Math.round(obj.fontSize / scale),  // 字号也需要转换
                    color: obj.fill,
                    textAlign: obj.textAlign,
                    charSpacing: obj.charSpacing || 0,
                    lineHeight: obj.lineHeight || 1.2
                }
            };
            
            if (obj.regionId && obj.regionId.startsWith('region_')) {
                edits.push(data);
            } else {
                insertions.push(data);
            }
        } else if (obj.type === 'image' && obj !== teBackgroundImage) {
            // 插入的图片，同样转换坐标
            const canvasLeft = obj.left;
            const canvasTop = obj.top;
            const canvasWidth = obj.width * obj.scaleX;
            const canvasHeight = obj.height * obj.scaleY;
            
            const originalX = Math.round((canvasLeft - offsetX) / scale);
            const originalY = Math.round((canvasTop - offsetY) / scale);
            const originalW = Math.round(canvasWidth / scale);
            const originalH = Math.round(canvasHeight / scale);
            
            insertions.push({
                type: 'image',
                x: originalX,
                y: originalY,
                width: originalW,
                height: originalH,
                url: obj.getSrc()
            });
        }
    });
    
    console.log('[文字编辑] 编辑数量:', edits.length);
    console.log('[文字编辑] 插入数量:', insertions.length);
    console.log('[文字编辑] 编辑详情:', edits);
    console.log('[文字编辑] 插入详情:', insertions);
    
    // 显示加载状态
    document.getElementById('te-loading').style.display = 'flex';
    document.getElementById('te-apply-btn').disabled = true;
    
    // 提交到后端，包含图片尺寸信息
    fetch('/api/apply-text-edits', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            image: teOriginalImageData,
            edits: edits,
            insertions: insertions,
            dimensions: {
                width: originalWidth,
                height: originalHeight
            }
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('[文字编辑] AI融合响应:', data);
        
        document.getElementById('te-loading').style.display = 'none';
        document.getElementById('te-apply-btn').disabled = false;
        
        if (data.success) {
            console.log('[文字编辑] ✅ AI融合成功');
            
            // 显示结果
            showResultDialog(data.image_url);
        } else {
            showNotification('应用失败: ' + (data.error || '未知错误'), 'error', 3000);
        }
    })
    .catch(error => {
        console.error('[文字编辑] 应用错误:', error);
        document.getElementById('te-loading').style.display = 'none';
        document.getElementById('te-apply-btn').disabled = false;
        showNotification('应用失败: ' + error.message, 'error', 3000);
    });
}

function showResultDialog(imageUrl) {
    // 创建结果对话框
    const dialog = document.createElement('div');
    dialog.className = 'result-dialog';
    dialog.innerHTML = `
        <div class="result-dialog-content">
            <div class="result-dialog-header">
                <h3>处理完成</h3>
                <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="result-dialog-body">
                <img src="${imageUrl}" alt="处理结果" style="max-width: 100%; max-height: 500px;">
            </div>
            <div class="result-dialog-footer">
                <button class="secondary-btn" onclick="this.parentElement.parentElement.parentElement.remove()">关闭</button>
                <button class="download-btn" onclick="downloadResultImage('${imageUrl}')">下载图片</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
}

function downloadResultImage(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `text_edited_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ==========================================
// 页面加载时初始化（已移除，由 app.js 的 showPage 函数统一管理）
// ==========================================

// ==========================================
// 画布缩放和拖拽功能
// ==========================================

function initCanvasZoomAndPan() {
    const canvasWrapper = document.getElementById('te-canvas-wrapper');
    if (!canvasWrapper || !teCanvas) return;
    
    // 鼠标滚轮缩放
    canvasWrapper.addEventListener('wheel', handleCanvasWheel, { passive: false });
    
    // 鼠标拖拽移动画布
    teCanvas.on('mouse:down', function(opt) {
        // 如果正在文字提取模式，不启用拖拽
        if (teIsSelecting) {
            return;
        }
        
        const evt = opt.e;
        // 按住空格键或中键拖拽，或者在没有选中对象时按住左键拖拽
        if (evt.button === 1 || evt.spaceKey || (evt.button === 0 && !teCanvas.getActiveObject())) {
            teIsPanning = true;
            teCanvas.selection = false;
            teLastPosX = evt.clientX;
            teLastPosY = evt.clientY;
            teCanvas.defaultCursor = 'grabbing';
            evt.preventDefault();
        }
    });
    
    teCanvas.on('mouse:move', function(opt) {
        if (teIsPanning) {
            const evt = opt.e;
            const vpt = teCanvas.viewportTransform;
            vpt[4] += evt.clientX - teLastPosX;
            vpt[5] += evt.clientY - teLastPosY;
            teCanvas.requestRenderAll();
            teLastPosX = evt.clientX;
            teLastPosY = evt.clientY;
        }
    });
    
    teCanvas.on('mouse:up', function(opt) {
        if (teIsPanning) {
            teIsPanning = false;
            teCanvas.selection = true;
            teCanvas.defaultCursor = 'default';
        }
    });
    
    // 监听空格键，按住时切换为拖拽模式
    document.addEventListener('keydown', function(e) {
        if (e.code === 'Space' && !teIsPanning && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            teCanvas.defaultCursor = 'grab';
        }
    });
    
    document.addEventListener('keyup', function(e) {
        if (e.code === 'Space') {
            teCanvas.defaultCursor = 'default';
        }
    });
    
    // 添加键盘快捷键
    setupZoomShortcuts();
    
    console.log('[文字编辑] 缩放和拖拽功能已启用');
}

function setupZoomShortcuts() {
    document.addEventListener('keydown', function(e) {
        // 忽略输入框中的按键
        if (document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA' ||
            !teCanvas) {
            return;
        }
        
        // Delete 或 Backspace：删除选中的对象
        if (e.key === 'Delete' || e.key === 'Backspace') {
            const activeObject = teCanvas.getActiveObject();
            if (activeObject && activeObject !== teBackgroundImage) {
                e.preventDefault();
                deleteSelectedObject();
            }
        }
        
        // Ctrl/Cmd + 加号：放大
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            zoomIn();
        }
        
        // Ctrl/Cmd + 减号：缩小
        if ((e.ctrlKey || e.metaKey) && e.key === '-') {
            e.preventDefault();
            zoomOut();
        }
        
        // Ctrl/Cmd + 0：重置缩放
        if ((e.ctrlKey || e.metaKey) && e.key === '0') {
            e.preventDefault();
            resetZoom();
        }
        
        // Ctrl/Cmd + F：适应屏幕
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            fitToScreen();
        }
    });
}

// 删除选中的对象
function deleteSelectedObject() {
    const activeObject = teCanvas.getActiveObject();
    if (!activeObject) {
        console.log('[删除] 没有选中的对象');
        return;
    }
    
    // 不允许删除背景图
    if (activeObject === teBackgroundImage) {
        console.log('[删除] 不能删除背景图');
        return;
    }
    
    console.log('[删除] 删除对象:', activeObject.type);
    
    // 如果是文本框，从列表中移除
    if (activeObject.type === 'textbox') {
        const index = teTextBoxes.indexOf(activeObject);
        if (index > -1) {
            teTextBoxes.splice(index, 1);
        }
    }
    
    // 从 Canvas 中移除
    teCanvas.remove(activeObject);
    teCanvas.discardActiveObject();
    teCanvas.renderAll();
    
    // 更新文本列表
    if (activeObject.type === 'textbox') {
        updateTextList();
    }
    
    // 保存历史
    saveHistory();
    
    console.log('[删除] ✅ 删除成功');
}

// ==========================================
// 悬浮删除按钮
// ==========================================

function initDeleteButton() {
    if (!teCanvas) return;
    
    // 创建删除按钮元素
    const canvasWrapper = document.getElementById('te-canvas-wrapper');
    if (!canvasWrapper) return;
    
    teDeleteButton = document.createElement('button');
    teDeleteButton.className = 'canvas-delete-btn';
    teDeleteButton.innerHTML = '×';
    teDeleteButton.style.display = 'none';
    teDeleteButton.title = '删除 (Delete/Backspace)';
    
    // 点击删除按钮
    teDeleteButton.addEventListener('click', function(e) {
        e.stopPropagation();
        if (teHoveredObject) {
            teCanvas.setActiveObject(teHoveredObject);
            deleteSelectedObject();
            teDeleteButton.style.display = 'none';
            teHoveredObject = null;
        }
    });
    
    canvasWrapper.appendChild(teDeleteButton);
    
    // 监听鼠标移动事件
    teCanvas.on('mouse:move', function(options) {
        if (teIsSelecting || teIsRemoving || teIsPanning) {
            // 在选择模式或拖拽模式下不显示删除按钮
            teDeleteButton.style.display = 'none';
            return;
        }
        
        const pointer = teCanvas.getPointer(options.e);
        const objects = teCanvas.getObjects();
        
        // 检查鼠标是否在某个对象上（排除背景图和文本框）
        let foundObject = null;
        for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            if (obj === teBackgroundImage) continue;
            if (obj.type === 'textbox') continue; // 文本框不显示悬浮删除按钮
            
            if (obj.containsPoint(pointer)) {
                foundObject = obj;
                break;
            }
        }
        
        if (foundObject) {
            // 显示删除按钮
            teHoveredObject = foundObject;
            const bounds = foundObject.getBoundingRect();
            const zoom = teCanvas.getZoom();
            const vpt = teCanvas.viewportTransform;
            
            // 计算删除按钮的位置（对象右上角）
            const btnX = bounds.left * zoom + vpt[4] + bounds.width * zoom - 15;
            const btnY = bounds.top * zoom + vpt[5] - 15;
            
            teDeleteButton.style.left = btnX + 'px';
            teDeleteButton.style.top = btnY + 'px';
            teDeleteButton.style.display = 'block';
        } else {
            // 隐藏删除按钮
            teDeleteButton.style.display = 'none';
            teHoveredObject = null;
        }
    });
    
    // Canvas 外部移动时隐藏按钮
    canvasWrapper.addEventListener('mouseleave', function() {
        teDeleteButton.style.display = 'none';
        teHoveredObject = null;
    });
    
    console.log('[删除按钮] 悬浮删除按钮已初始化');
}

// ==========================================
// WPS 风格颜色选择器
// ==========================================

// 预设颜色池（类似 WPS）
const teColorPalette = [
    // 第一行：主题色
    ['#000000', '#FFFFFF', '#E74C3C', '#E67E22', '#F39C12', '#F1C40F', '#2ECC71', '#1ABC9C'],
    // 第二行：常用色
    ['#3498DB', '#9B59B6', '#34495E', '#95A5A6', '#7F8C8D', '#BDC3C7', '#ECF0F1', '#D35400'],
    // 第三行：浅色调
    ['#FADBD8', '#F5CBA7', '#FAD7A0', '#FCF3CF', '#D5F4E6', '#D1F2EB', '#D6EAF8', '#E8DAEF'],
    // 第四行：深色调
    ['#943126', '#AF601A', '#B9770E', '#9A7D0A', '#186A3B', '#138D75', '#21618C', '#633974'],
    // 第五行：更多颜色
    ['#512E5F', '#154360', '#0E6251', '#145A32', '#7D6608', '#784212', '#6E2C00', '#641E16']
];

// 显示颜色选择器
function showColorPicker(target = 'text') {
    teCurrentColorTarget = target;
    const colorPicker = document.getElementById('te-color-picker');
    if (!colorPicker) {
        createColorPicker();
        return showColorPicker(target);
    }
    
    // 显示颜色选择器
    colorPicker.style.display = 'block';
    teColorPickerVisible = true;
    
    // 定位到颜色按钮附近
    const colorBtn = document.getElementById('te-text-color-btn');
    if (colorBtn) {
        const rect = colorBtn.getBoundingClientRect();
        colorPicker.style.left = rect.left + 'px';
        colorPicker.style.top = (rect.bottom + 5) + 'px';
    }
    
    console.log('[颜色选择器] 显示颜色选择器');
}

// 隐藏颜色选择器
function hideColorPicker() {
    const colorPicker = document.getElementById('te-color-picker');
    if (colorPicker) {
        colorPicker.style.display = 'none';
    }
    teColorPickerVisible = false;
    console.log('[颜色选择器] 隐藏颜色选择器');
}

// 创建颜色选择器 DOM
function createColorPicker() {
    const colorPicker = document.createElement('div');
    colorPicker.id = 'te-color-picker';
    colorPicker.className = 'color-picker-panel';
    
    // 创建颜色网格
    let html = '<div class="color-picker-header">选择颜色</div>';
    html += '<div class="color-picker-grid">';
    
    teColorPalette.forEach(row => {
        html += '<div class="color-picker-row">';
        row.forEach(color => {
            html += `<div class="color-picker-item" data-color="${color}" style="background-color: ${color};" title="${color}"></div>`;
        });
        html += '</div>';
    });
    
    html += '</div>';
    
    // 自定义颜色输入
    html += '<div class="color-picker-custom">';
    html += '<label>自定义颜色：</label>';
    html += '<input type="color" id="te-custom-color-input" value="#000000" />';
    html += '<button class="color-picker-ok-btn" id="te-color-ok-btn">确定</button>';
    html += '</div>';
    
    colorPicker.innerHTML = html;
    document.body.appendChild(colorPicker);
    
    // 点击颜色项
    colorPicker.querySelectorAll('.color-picker-item').forEach(item => {
        item.addEventListener('click', function() {
            const color = this.getAttribute('data-color');
            applyColor(color);
            hideColorPicker();
        });
    });
    
    // 点击确定按钮
    const okBtn = colorPicker.querySelector('#te-color-ok-btn');
    if (okBtn) {
        okBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            applyCustomColor();
        });
    }
    
    // 自定义颜色输入框变化时实时预览（可选）
    const customInput = colorPicker.querySelector('#te-custom-color-input');
    if (customInput) {
        customInput.addEventListener('change', function() {
            // 可以在这里添加实时预览功能
            console.log('[颜色选择器] 自定义颜色已选择:', this.value);
        });
    }
    
    // 点击外部关闭
    document.addEventListener('click', function(e) {
        if (teColorPickerVisible && 
            !colorPicker.contains(e.target) && 
            !e.target.closest('#te-text-color-btn')) {
            hideColorPicker();
        }
    });
    
    console.log('[颜色选择器] 颜色选择器已创建');
}

// 应用选中的颜色
function applyColor(color) {
    if (!teSelectedTextBox) {
        console.warn('[颜色选择器] 没有选中的文本框');
        showNotification('请先选中一个文本框', 'warning', 2000);
        return;
    }
    
    if (!color) {
        console.error('[颜色选择器] 颜色值为空');
        return;
    }
    
    console.log('[颜色选择器] 应用颜色:', color, '到文本框:', teSelectedTextBox.text);
    
    // 更新文本框颜色
    updateTextStyle('fill', color);
    
    // 更新颜色显示
    const colorBtn = document.getElementById('te-text-color-btn');
    if (colorBtn) {
        const colorPreview = colorBtn.querySelector('.color-preview');
        if (colorPreview) {
            colorPreview.style.backgroundColor = color;
        } else {
            // 如果没有预览元素，创建一个
            const svg = colorBtn.querySelector('svg');
            if (svg) {
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', '4');
                rect.setAttribute('y', '20');
                rect.setAttribute('width', '16');
                rect.setAttribute('height', '3');
                rect.setAttribute('class', 'color-preview');
                rect.setAttribute('fill', color);
                svg.appendChild(rect);
            }
        }
    }
    
    console.log('[颜色选择器] ✅ 颜色已应用');
}

// 应用自定义颜色
function applyCustomColor() {
    console.log('[颜色选择器] 应用自定义颜色');
    
    const customInput = document.getElementById('te-custom-color-input');
    if (!customInput) {
        console.error('[颜色选择器] 找不到自定义颜色输入框');
        return;
    }
    
    const color = customInput.value;
    if (!color) {
        console.error('[颜色选择器] 颜色值为空');
        return;
    }
    
    console.log('[颜色选择器] 自定义颜色值:', color);
    
    // 应用颜色
    applyColor(color);
    
    // 隐藏颜色选择器
    hideColorPicker();
}

function handleCanvasWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const delta = e.deltaY;
    let zoom = teCanvas.getZoom();
    
    // 缩放增量
    zoom *= 0.999 ** delta;
    
    // 限制缩放范围：10% - 500%
    if (zoom > 5) zoom = 5;
    if (zoom < 0.1) zoom = 0.1;
    
    // 以鼠标位置为中心缩放
    const point = new fabric.Point(e.offsetX, e.offsetY);
    teCanvas.zoomToPoint(point, zoom);
    
    teZoom = zoom;
    updateZoomDisplay();
    
    e.preventDefault();
    e.stopPropagation();
}

// 缩放控制函数
function zoomIn() {
    let zoom = teCanvas.getZoom();
    zoom *= 1.2;
    if (zoom > 5) zoom = 5;
    
    // 以画布中心缩放
    const center = teCanvas.getCenter();
    teCanvas.zoomToPoint(new fabric.Point(center.left, center.top), zoom);
    
    teZoom = zoom;
    updateZoomDisplay();
}

function zoomOut() {
    let zoom = teCanvas.getZoom();
    zoom /= 1.2;
    if (zoom < 0.1) zoom = 0.1;
    
    // 以画布中心缩放
    const center = teCanvas.getCenter();
    teCanvas.zoomToPoint(new fabric.Point(center.left, center.top), zoom);
    
    teZoom = zoom;
    updateZoomDisplay();
}

function resetZoom() {
    teCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    teZoom = 1;
    updateZoomDisplay();
}

function fitToScreen() {
    if (!teBackgroundImage) return;
    
    const canvasWrapper = document.getElementById('te-canvas-wrapper');
    if (!canvasWrapper) return;
    
    const wrapperWidth = canvasWrapper.clientWidth;
    const wrapperHeight = canvasWrapper.clientHeight;
    
    const imgWidth = teCanvas.width;
    const imgHeight = teCanvas.height;
    
    // 计算合适的缩放比例（留10px边距，让画布占据更多空间）
    const scaleX = (wrapperWidth - 20) / imgWidth;
    const scaleY = (wrapperHeight - 20) / imgHeight;
    const scale = Math.min(scaleX, scaleY, 1); // 不超过100%
    
    // 重置视口并设置缩放
    teCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    teCanvas.setZoom(scale);
    
    // 居中画布
    const vpt = teCanvas.viewportTransform;
    vpt[4] = (wrapperWidth - imgWidth * scale) / 2;
    vpt[5] = (wrapperHeight - imgHeight * scale) / 2;
    
    teCanvas.requestRenderAll();
    teZoom = scale;
    updateZoomDisplay();
}

function updateZoomDisplay() {
    const zoomPercent = Math.round(teZoom * 100);
    const zoomDisplay = document.getElementById('te-zoom-display');
    if (zoomDisplay) {
        zoomDisplay.textContent = `${zoomPercent}%`;
    }
}

// ==========================================
// 文字提取工具
// ==========================================

function startTextExtraction() {
    if (!teCanvas || !teBackgroundImage) {
        showNotification('请先上传图片', 'warning', 2000);
        return;
    }
    
    // 如果文字去除模式正在激活，先取消它
    if (teIsRemoving) {
        console.log('[文字提取] 检测到文字去除模式激活，先取消它');
        cancelTextRemoval();
    }
    
    if (teIsSelecting) {
        // 如果已经在选择中，取消选择
        cancelTextExtraction();
        return;
    }
    
    console.log('[文字提取] 启动选择模式');
    teIsSelecting = true;
    
    // 更新按钮样式
    const btn = document.getElementById('te-extract-text-btn');
    if (btn) {
        btn.style.backgroundColor = '#4a90e2';
        btn.style.color = 'white';
    }
    
    // 禁用其他交互
    teCanvas.selection = false;
    teCanvas.defaultCursor = 'crosshair';
    
    // 禁用拖拽功能（重要：防止与选择功能冲突）
    teIsPanning = false;
    
    // 禁用所有文本框的选择
    teTextBoxes.forEach(box => {
        box.selectable = false;
        box.evented = false;
    });
    
    // 添加鼠标事件监听（使用更高优先级，在拖拽事件之前）
    teCanvas.on('mouse:down', handleSelectionStart);
    teCanvas.on('mouse:move', handleSelectionMove);
    teCanvas.on('mouse:up', handleSelectionEnd);
    
    console.log('[文字提取] 请在图片上拖动选择要识别的区域');
}

function cancelTextExtraction() {
    console.log('[文字提取] 取消选择模式');
    teIsSelecting = false;
    
    // 恢复按钮样式
    const btn = document.getElementById('te-extract-text-btn');
    if (btn) {
        btn.style.backgroundColor = '';
        btn.style.color = '';
    }
    
    // 移除选择矩形
    if (teSelectionRect) {
        teCanvas.remove(teSelectionRect);
        teSelectionRect = null;
    }
    
    // 恢复Canvas交互
    teCanvas.selection = true;
    teCanvas.defaultCursor = 'default';
    
    // 恢复文本框的选择
    teTextBoxes.forEach(box => {
        box.selectable = true;
        box.evented = true;
    });
    
    // 移除鼠标事件监听
    teCanvas.off('mouse:down', handleSelectionStart);
    teCanvas.off('mouse:move', handleSelectionMove);
    teCanvas.off('mouse:up', handleSelectionEnd);
}

function handleSelectionStart(event) {
    if (!teIsSelecting) return;
    
    // 阻止事件冒泡，防止触发拖拽功能
    event.e.preventDefault();
    event.e.stopPropagation();
    
    // 强制禁用拖拽
    teIsPanning = false;
    
    const pointer = teCanvas.getPointer(event.e);
    teSelectionStartX = pointer.x;
    teSelectionStartY = pointer.y;
    
    // 创建选择矩形
    teSelectionRect = new fabric.Rect({
        left: teSelectionStartX,
        top: teSelectionStartY,
        width: 0,
        height: 0,
        fill: 'rgba(74, 144, 226, 0.2)',
        stroke: '#4a90e2',
        strokeWidth: 2,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false
    });
    
    teCanvas.add(teSelectionRect);
    teCanvas.renderAll();
}

function handleSelectionMove(event) {
    if (!teIsSelecting || !teSelectionRect) return;
    
    // 阻止事件冒泡，防止触发拖拽功能
    event.e.preventDefault();
    event.e.stopPropagation();
    
    // 强制禁用拖拽
    teIsPanning = false;
    
    const pointer = teCanvas.getPointer(event.e);
    
    // 计算矩形的位置和大小
    const width = pointer.x - teSelectionStartX;
    const height = pointer.y - teSelectionStartY;
    
    if (width < 0) {
        teSelectionRect.set({ left: pointer.x });
    }
    if (height < 0) {
        teSelectionRect.set({ top: pointer.y });
    }
    
    teSelectionRect.set({
        width: Math.abs(width),
        height: Math.abs(height)
    });
    
    teCanvas.renderAll();
}

function handleSelectionEnd(event) {
    if (!teIsSelecting || !teSelectionRect) return;
    
    // 阻止事件冒泡，防止触发拖拽功能
    event.e.preventDefault();
    event.e.stopPropagation();
    
    // 强制禁用拖拽
    teIsPanning = false;
    
    const rect = teSelectionRect;
    const rectLeft = rect.left;
    const rectTop = rect.top;
    const rectWidth = rect.width;
    const rectHeight = rect.height;
    
    // 检查选择区域是否有效（至少 20x20 像素）
    if (rectWidth < 20 || rectHeight < 20) {
        console.log('[文字提取] 选择区域太小，取消识别');
        cancelTextExtraction();
        return;
    }
    
    console.log('[文字提取] 选择区域:', {
        left: rectLeft,
        top: rectTop,
        width: rectWidth,
        height: rectHeight
    });
    
    // 显示确认对话框
    showExtractionConfirmDialog(rectLeft, rectTop, rectWidth, rectHeight);
}

function showExtractionConfirmDialog(left, top, width, height) {
    const confirmed = confirm(`是否要提取选中区域的文字？\n\n区域大小：${Math.round(width)} x ${Math.round(height)} 像素`);
    
    if (confirmed) {
        // 执行OCR识别
        extractTextFromRegion(left, top, width, height);
    } else {
        // 取消选择
        cancelTextExtraction();
    }
}

async function extractTextFromRegion(left, top, width, height) {
    console.log('[文字提取] 开始识别选中区域的文字...');
    
    // 显示加载状态
    document.getElementById('te-canvas-loading').style.display = 'flex';
    document.querySelector('#te-canvas-loading p').textContent = '正在识别文字...';
    
    try {
        // 将Canvas坐标转换为原图坐标
        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;
        
        if (teBackgroundImage && teBackgroundImage._scale) {
            scale = teBackgroundImage._scale;
            offsetX = teBackgroundImage._offsetX || 0;
            offsetY = teBackgroundImage._offsetY || 0;
        }
        
        // 转换为原图坐标
        const originalLeft = (left - offsetX) / scale;
        const originalTop = (top - offsetY) / scale;
        const originalWidth = width / scale;
        const originalHeight = height / scale;
        
        console.log('[文字提取] 原图坐标:', {
            left: originalLeft,
            top: originalTop,
            width: originalWidth,
            height: originalHeight
        });
        
        // 从原图中裁剪选中区域
        const croppedImageData = await cropImageRegion(
            teOriginalImageData,
            originalLeft,
            originalTop,
            originalWidth,
            originalHeight
        );
        
        // 调用OCR API识别
        const blob = await dataURLtoBlob(croppedImageData);
        const formData = new FormData();
        formData.append('image', blob, 'region.png');
        
        const response = await fetch('/api/text-recognition', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        // 隐藏加载状态
        document.getElementById('te-canvas-loading').style.display = 'none';
        
        if (data.success && data.textRegions && data.textRegions.length > 0) {
            console.log(`[文字提取] ✅ 识别到 ${data.textRegions.length} 个文字区域`);
            
            // 将OCR结果的坐标转换回Canvas坐标（加上选择区域的偏移）
            const adjustedRegions = data.textRegions.map(region => ({
                ...region,
                x: originalLeft + region.x,
                y: originalTop + region.y
            }));
            
            // 创建文本框
            createTextBoxesFromOCR(adjustedRegions);
            
            // 更新左侧文本列表
            updateTextList();
            
            // 启用应用按钮
            document.getElementById('te-apply-btn').disabled = false;
            
            // 保存历史状态
            saveHistory();
            
            // 取消选择模式
            cancelTextExtraction();
        } else {
            showNotification('未识别到文字，请尝试选择其他区域', 'warning', 3000);
            cancelTextExtraction();
        }
    } catch (error) {
        console.error('[文字提取] 错误:', error);
        document.getElementById('te-canvas-loading').style.display = 'none';
        showNotification('文字识别失败: ' + error.message, 'error', 3000);
        cancelTextExtraction();
    }
}

// 裁剪图片区域
async function cropImageRegion(imageDataURL, left, top, width, height) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // 绘制裁剪后的图片
            ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
            
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = imageDataURL;
    });
}

// 将 DataURL 转换为 Blob
async function dataURLtoBlob(dataURL) {
    const response = await fetch(dataURL);
    return await response.blob();
}

// ==========================================
// 文字去除工具
// ==========================================

function startTextRemoval() {
    if (!teCanvas || !teBackgroundImage) {
        showNotification('请先上传图片', 'warning', 2000);
        return;
    }
    
    // 如果文字提取模式正在激活，先取消它
    if (teIsSelecting) {
        console.log('[文字去除] 检测到文字提取模式激活，先取消它');
        cancelTextExtraction();
    }
    
    if (teIsRemoving) {
        // 如果已经在去除模式中，取消
        cancelTextRemoval();
        return;
    }
    
    console.log('[文字去除] 启动选择模式');
    teIsRemoving = true;
    
    // 更新按钮样式
    const btn = document.getElementById('te-remove-text-btn');
    if (btn) {
        btn.style.backgroundColor = '#e74c3c';
        btn.style.color = 'white';
    }
    
    // 禁用其他交互
    teCanvas.selection = false;
    teCanvas.defaultCursor = 'crosshair';
    
    // 禁用拖拽功能
    teIsPanning = false;
    
    // 禁用所有文本框的选择
    teTextBoxes.forEach(box => {
        box.selectable = false;
        box.evented = false;
    });
    
    // 添加鼠标事件监听
    teCanvas.on('mouse:down', handleRemovalStart);
    teCanvas.on('mouse:move', handleRemovalMove);
    teCanvas.on('mouse:up', handleRemovalEnd);
    
    console.log('[文字去除] 请在图片上拖动选择要去除文字的区域');
}

function cancelTextRemoval() {
    console.log('[文字去除] 取消选择模式');
    teIsRemoving = false;
    
    // 恢复按钮样式
    const btn = document.getElementById('te-remove-text-btn');
    if (btn) {
        btn.style.backgroundColor = '';
        btn.style.color = '';
    }
    
    // 移除选择矩形
    if (teRemovalRect) {
        teCanvas.remove(teRemovalRect);
        teRemovalRect = null;
    }
    
    // 恢复Canvas交互
    teCanvas.selection = true;
    teCanvas.defaultCursor = 'default';
    
    // 恢复文本框的选择
    teTextBoxes.forEach(box => {
        box.selectable = true;
        box.evented = true;
    });
    
    // 移除鼠标事件监听
    teCanvas.off('mouse:down', handleRemovalStart);
    teCanvas.off('mouse:move', handleRemovalMove);
    teCanvas.off('mouse:up', handleRemovalEnd);
}

function handleRemovalStart(event) {
    if (!teIsRemoving) return;
    
    // 阻止事件冒泡
    event.e.preventDefault();
    event.e.stopPropagation();
    
    // 强制禁用拖拽
    teIsPanning = false;
    
    const pointer = teCanvas.getPointer(event.e);
    teRemovalStartX = pointer.x;
    teRemovalStartY = pointer.y;
    
    // 创建选择矩形（红色表示删除）
    teRemovalRect = new fabric.Rect({
        left: teRemovalStartX,
        top: teRemovalStartY,
        width: 0,
        height: 0,
        fill: 'rgba(231, 76, 60, 0.2)',
        stroke: '#e74c3c',
        strokeWidth: 2,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false
    });
    
    teCanvas.add(teRemovalRect);
    teCanvas.renderAll();
}

function handleRemovalMove(event) {
    if (!teIsRemoving || !teRemovalRect) return;
    
    // 阻止事件冒泡
    event.e.preventDefault();
    event.e.stopPropagation();
    
    // 强制禁用拖拽
    teIsPanning = false;
    
    const pointer = teCanvas.getPointer(event.e);
    
    // 计算矩形的位置和大小
    const width = pointer.x - teRemovalStartX;
    const height = pointer.y - teRemovalStartY;
    
    if (width < 0) {
        teRemovalRect.set({ left: pointer.x });
    }
    if (height < 0) {
        teRemovalRect.set({ top: pointer.y });
    }
    
    teRemovalRect.set({
        width: Math.abs(width),
        height: Math.abs(height)
    });
    
    teCanvas.renderAll();
}

function handleRemovalEnd(event) {
    if (!teIsRemoving || !teRemovalRect) return;
    
    // 阻止事件冒泡
    event.e.preventDefault();
    event.e.stopPropagation();
    
    // 强制禁用拖拽
    teIsPanning = false;
    
    const rect = teRemovalRect;
    const rectLeft = rect.left;
    const rectTop = rect.top;
    const rectWidth = rect.width;
    const rectHeight = rect.height;
    
    // 检查选择区域是否有效（至少 20x20 像素）
    if (rectWidth < 20 || rectHeight < 20) {
        console.log('[文字去除] 选择区域太小，取消操作');
        cancelTextRemoval();
        return;
    }
    
    console.log('[文字去除] 选择区域:', {
        left: rectLeft,
        top: rectTop,
        width: rectWidth,
        height: rectHeight
    });
    
    // 显示确认对话框
    showRemovalConfirmDialog(rectLeft, rectTop, rectWidth, rectHeight);
}

function showRemovalConfirmDialog(left, top, width, height) {
    const confirmed = confirm(`是否要去除选中区域的文字？\n\n区域大小：${Math.round(width)} x ${Math.round(height)} 像素\n\nAI 会智能移除文字并填充背景`);
    
    if (confirmed) {
        // 执行文字去除
        removeTextFromRegion(left, top, width, height);
    } else {
        // 取消选择
        cancelTextRemoval();
    }
}

async function removeTextFromRegion(left, top, width, height) {
    console.log('[文字去除] 开始去除选中区域的文字...');
    
    // 显示加载状态
    document.getElementById('te-canvas-loading').style.display = 'flex';
    document.querySelector('#te-canvas-loading p').textContent = '正在去除文字...';
    
    try {
        // 将Canvas坐标转换为原图坐标
        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;
        
        if (teBackgroundImage && teBackgroundImage._scale) {
            scale = teBackgroundImage._scale;
            offsetX = teBackgroundImage._offsetX || 0;
            offsetY = teBackgroundImage._offsetY || 0;
        }
        
        // 转换为原图坐标
        const originalLeft = (left - offsetX) / scale;
        const originalTop = (top - offsetY) / scale;
        const originalWidth = width / scale;
        const originalHeight = height / scale;
        
        console.log('[文字去除] 原图坐标:', {
            left: originalLeft,
            top: originalTop,
            width: originalWidth,
            height: originalHeight
        });
        
        // 调用文字去除API
        const response = await fetch('/api/text-inpainting', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: teOriginalImageData,
                region: {
                    x: Math.round(originalLeft),
                    y: Math.round(originalTop),
                    width: Math.round(originalWidth),
                    height: Math.round(originalHeight)
                }
            })
        });
        
        const data = await response.json();
        
        // 隐藏加载状态
        document.getElementById('te-canvas-loading').style.display = 'none';
        
        if (data.success && data.image_url) {
            console.log('[文字去除] ✅ 文字去除成功');
            
            // 更新原始图片数据和Canvas显示
            await updateCanvasWithNewImage(data.image_url);
            
            // 取消选择模式
            cancelTextRemoval();
            
            // 提示用户
            showNotification('文字已成功去除！您现在可以继续编辑或插入新文字。', 'success', 3000);
        } else {
            showNotification('文字去除失败: ' + (data.error || '未知错误'), 'error', 3000);
            cancelTextRemoval();
        }
    } catch (error) {
        console.error('[文字去除] 错误:', error);
        document.getElementById('te-canvas-loading').style.display = 'none';
        showNotification('文字去除失败: ' + error.message, 'error', 3000);
        cancelTextRemoval();
    }
}

async function updateCanvasWithNewImage(imageUrl) {
    return new Promise((resolve, reject) => {
        // 转换为完整URL（如果是相对路径）
        const fullImageUrl = imageUrl.startsWith('/') ? window.location.origin + imageUrl : imageUrl;
        
        // 加载新图片
        fabric.Image.fromURL(fullImageUrl, function(img) {
            // 保存旧的Canvas尺寸和缩放信息
            const oldCanvasWidth = teCanvas.width;
            const oldCanvasHeight = teCanvas.height;
            const oldScale = teBackgroundImage._scale;
            const oldOffsetX = teBackgroundImage._offsetX;
            const oldOffsetY = teBackgroundImage._offsetY;
            
            // 收集所有文本框（保留它们的位置）
            const existingTextBoxes = teCanvas.getObjects().filter(obj => obj.type === 'textbox');
            
            // 清空Canvas但保留文本框
            teCanvas.remove(teBackgroundImage);
            
            // 设置新的背景图片（使用相同的尺寸和位置）
            img.set({
                scaleX: oldScale,
                scaleY: oldScale,
                selectable: false,
                evented: false,
                left: oldOffsetX,
                top: oldOffsetY
            });
            
            teCanvas.setBackgroundImage(img, teCanvas.renderAll.bind(teCanvas));
            teBackgroundImage = img;
            
            // 保存图片的原始尺寸和缩放信息
            teBackgroundImage._originalWidth = img.width;
            teBackgroundImage._originalHeight = img.height;
            teBackgroundImage._scale = oldScale;
            teBackgroundImage._offsetX = oldOffsetX;
            teBackgroundImage._offsetY = oldOffsetY;
            
            // 更新原始图片数据（用于后续处理）
            fetch(fullImageUrl)
                .then(res => res.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = function() {
                        teOriginalImageData = reader.result;
                        console.log('[文字去除] 图片数据已更新');
                    };
                    reader.readAsDataURL(blob);
                })
                .catch(err => console.error('[文字去除] 无法更新图片数据:', err));
            
            console.log('[文字去除] 画布已更新为新图片');
            
            // 重新渲染，文本框会自动保留
            teCanvas.renderAll();
            
            // 保存历史状态
            saveHistory();
            
            resolve();
        }, null, { crossOrigin: 'anonymous' });
    });
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
