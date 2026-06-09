// ==========================================
// AI 图像处理助手 - 前端 JavaScript
// ==========================================

// API 基础路径
const API_BASE = '/api';

// Cropper 实例（用于尺寸修改功能）
let cropper = null;

// 存储上传的文件
const uploadedFiles = {
    defects: null,
    upscale: null,
    extract: null,
    text: null,
    background: {
        subject: null,
        background: null
    },
    resize: null,
    logo: {
        base: null,
        logo: null
    },
    expand: null,
    migration: {
        product: null,
        scene: null
    },
    watermark: null
};

// 存储结果 URL
const resultUrls = {};

// 历史记录
let processHistory = [];

// 参考图存储
let homeRefImages = [];
let chatRefImages = [];

// ==========================================
// 页面切换
// ==========================================
function showPage(pageName) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // 显示目标页面 - 如果pageName已经包含-page，直接使用；否则拼接-page
    let pageId = pageName;
    if (!pageName.endsWith('-page')) {
        pageId = pageName + '-page';
    }
    
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // 如果是历史记录页面，渲染历史记录
    if (pageName === 'history') {
        renderHistory();
    }
    
    // 如果是文字编辑页面，初始化编辑器
    if (pageName === 'text-editor' || pageName === 'text-editor-page' || pageId === 'text-editor-page') {
        // 延迟初始化，确保DOM已渲染
        setTimeout(function() {
            if (typeof initTextEditor === 'function') {
                initTextEditor();
            } else {
                console.warn('[文字编辑] initTextEditor 函数未找到，请检查 text_editor.js 是否已加载');
            }
        }, 100);
    }
    
    // 如果是戳戳秀页面，加载模型列表
    if (pageName === 'poke-art' || pageId === 'poke-art-page') {
        // 延迟加载，确保DOM已渲染
        setTimeout(function() {
            if (typeof loadPokeArtModels === 'function') {
                loadPokeArtModels();
            }
        }, 100);
    }
    
    // 滚动到顶部
    window.scrollTo(0, 0);
}

// ==========================================
// 文件选择处理
// ==========================================
function handleFileSelect(type, input, imageIndex = null) {
    const file = input.files[0];
    if (!file) return;
    
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
        showNotification('请上传图片文件！', 'error');
        return;
    }
    
    // 验证文件大小 (5MB)
    if (file.size > 5 * 1024 * 1024) {
        showNotification('图片大小不能超过 5MB！', 'error');
        return;
    }
    
    // 保存文件
    if (type === 'background') {
        if (imageIndex === 1) {
            uploadedFiles.background.subject = file;
        } else {
            uploadedFiles.background.background = file;
        }
    } else if (type === 'logo') {
        if (imageIndex === 1) {
            uploadedFiles.logo.base = file;
        } else {
            uploadedFiles.logo.logo = file;
        }
    } else if (type === 'migration') {
        if (imageIndex === 1) {
            uploadedFiles.migration.product = file;
        } else {
            uploadedFiles.migration.scene = file;
        }
    } else {
        uploadedFiles[type] = file;
    }
    
    // 显示预览
    const reader = new FileReader();
    reader.onload = function(e) {
        let previewId, placeholderId;
        
        if (['background', 'logo', 'migration'].includes(type)) {
            previewId = `${type}-preview${imageIndex}`;
            placeholderId = `${type}-upload${imageIndex}`;
        } else if (type === 'resize') {
            previewId = `${type}-preview`;
            placeholderId = `${type}-upload-area`;
        } else {
            previewId = `${type}-preview`;
            placeholderId = `${type}-upload`;
        }
        
        const preview = document.getElementById(previewId);
        const placeholder = document.querySelector(`#${placeholderId} .upload-placeholder`);
        const uploadBox = document.getElementById(placeholderId);
        
        if (preview && placeholder) {
            preview.src = e.target.result;
            
            // Special handling for resize (Cropper.js)
            if (type === 'resize') {
                const resizeUploadArea = document.getElementById('resize-upload-area');
                const resizeEditor = document.getElementById('resize-editor');
                const resizeImageSource = document.getElementById('resize-image-source');
                const resizeResetBtn = document.getElementById('resize-reset-btn');
                
                // 隐藏上传区域，显示编辑器
                resizeUploadArea.style.display = 'none';
                resizeEditor.style.display = 'block';
                
                // 显示重新上传按钮
                if (resizeResetBtn) {
                    resizeResetBtn.style.display = 'inline-block';
                }
                
                resizeImageSource.src = e.target.result;
                
                // 销毁旧的裁剪器实例
                if (cropper) {
                    cropper.destroy();
                }
                
                // 等待图片加载后初始化裁剪器
                resizeImageSource.onload = function() {
                    cropper = new Cropper(resizeImageSource, {
                        viewMode: 1,
                        dragMode: 'move',
                        autoCropArea: 0.8,
                        restore: false,
                        guides: true,
                        center: true,
                        highlight: true,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false,
                        background: false,
                        responsive: true,
                        checkOrientation: true,
                        ready: function() {
                            console.log('裁剪器已准备就绪');
                        }
                    });
                };
                
            } else {
                preview.style.display = 'block';
                placeholder.style.display = 'none';
                // 添加 has-image 类以显示删除按钮
                if (uploadBox) {
                    uploadBox.classList.add('has-image');
                }
            }
        }
    };
    reader.readAsDataURL(file);
    
    // 启用处理按钮
    updateProcessButton(type);
}

// ==========================================
// 更新处理按钮状态
// ==========================================
function updateProcessButton(type) {
    const btn = document.getElementById(`${type}-btn`);
    if (!btn) return;
    
    let canProcess = false;
    
    if (type === 'background') {
        // 背景替换：必须上传主体图和背景图（细致要求是可选的）
        canProcess = uploadedFiles.background.subject && uploadedFiles.background.background;
    } else if (type === 'text') {
        const instruction = document.getElementById('text-instruction').value.trim();
        canProcess = uploadedFiles.text && instruction;
    } else if (type === 'logo') {
        canProcess = uploadedFiles.logo.base && uploadedFiles.logo.logo;
    } else if (type === 'migration') {
        canProcess = uploadedFiles.migration.product && uploadedFiles.migration.scene;
    } else {
        canProcess = uploadedFiles[type] !== null;
    }
    
    btn.disabled = !canProcess;
}

// 监听输入框变化以更新按钮状态
document.addEventListener('DOMContentLoaded', () => {
    // 加载历史记录
    loadHistory();
    
    // 文字修改
    const textInput = document.getElementById('text-instruction');
    if (textInput) {
        textInput.addEventListener('input', () => updateProcessButton('text'));
    }
    
    // 初始化对话历史
    if (Object.keys(chatSessions).length > 0) {
        updateChatHistory();
    }
    
    // 为对话页面输入框添加回车发送功能
    const chatPageInput = document.getElementById('chat-page-input');
    if (chatPageInput) {
        chatPageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatPageMessage();
            }
        });
    }
    
    // 为首页输入框添加回车发送功能
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
});

// =========================================
// 尺寸修改功能
// ==========================================
function setResizeRatio(ratio) {
    const ratioInput = document.getElementById('resize-ratio');
    const customInputs = document.getElementById('custom-resize-inputs');
    
    // 更新 hidden input
    ratioInput.value = ratio;
    
    // 更新按钮样式
    document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.classList.remove('active');
        const btnRatio = btn.getAttribute('data-ratio');
        
        if (ratio === 'custom') {
            if (btnRatio === 'custom') btn.classList.add('active');
        } else if (isNaN(ratio)) {
            if (btnRatio === 'NaN') btn.classList.add('active');
        } else {
            // Compare numbers with tolerance
            const r = parseFloat(btnRatio);
            if (Math.abs(r - ratio) < 0.01) btn.classList.add('active');
        }
    });
    
    // 显示/隐藏自定义输入
    if (ratio === 'custom') {
        customInputs.style.display = 'block';
    } else {
        customInputs.style.display = 'none';
    }
    
    if (cropper) {
        if (ratio === 'custom') {
            cropper.setAspectRatio(NaN);
        } else {
            cropper.setAspectRatio(ratio);
        }
    }
}

function updateCropBox() {
    if (!cropper) return;
    
    const wInput = document.getElementById('resize-w');
    const hInput = document.getElementById('resize-h');
    
    const w = parseFloat(wInput.value);
    const h = parseFloat(hInput.value);
    
    if (!isNaN(w) && !isNaN(h)) {
        const data = cropper.getData();
        cropper.setData({
            ...data,
            width: w,
            height: h
        });
    }
}


// ==========================================
// 处理图片
// ==========================================
async function processImage(type) {
    const btn = document.getElementById(`${type}-btn`);
    const loading = document.getElementById(`${type}-loading`);
    const resultSection = document.getElementById(`${type}-result`);
    
    // 禁用按钮
    btn.disabled = true;
    
    // 显示加载动画
    loading.style.display = 'flex';
    
    // 隐藏之前的结果
    if (resultSection) {
        resultSection.style.display = 'none';
    }
    
    try {
        let result;
        
        switch (type) {
            case 'defects':
                result = await callAPI('/remove-defects', { image: uploadedFiles.defects });
                break;
            case 'upscale':
                const scale = document.getElementById('upscale-scale').value;
                result = await callAPI('/upscale', { 
                    image: uploadedFiles.upscale,
                    scale: scale 
                });
                break;
            case 'extract':
                result = await callAPI('/extract-pattern', { image: uploadedFiles.extract });
                break;
            case 'text':
                const instruction = document.getElementById('text-instruction').value.trim();
                result = await callAPI('/replace-text', { 
                    image: uploadedFiles.text,
                    instruction: instruction
                });
                break;
            case 'background':
                // 确保两张图片都已上传
                if (!uploadedFiles.background.subject || !uploadedFiles.background.background) {
                    throw new Error("请上传主体图和背景图");
                }
                
                const bgData = {
                    subject_image: uploadedFiles.background.subject,
                    background_image: uploadedFiles.background.background
                };
                
                // 获取快捷选项
                const keepLogo = document.getElementById('background-keep-logo').value;
                const keepText = document.getElementById('background-keep-text').value;
                bgData.keep_logo = keepLogo;
                bgData.keep_text = keepText;
                
                // 获取用户的细致要求（可选）
                const bgInstruction = document.getElementById('background-prompt').value.trim();
                if (bgInstruction) {
                    bgData.instruction = bgInstruction;
                }
                
                result = await callAPI('/replace-background', bgData);
                break;
            case 'resize':
                const resizeData = { image: uploadedFiles.resize };
                
                if (cropper) {
                    const data = cropper.getData();
                    resizeData.x = Math.round(data.x);
                    resizeData.y = Math.round(data.y);
                    resizeData.w = Math.round(data.width);
                    resizeData.h = Math.round(data.height);
                } else {
                     throw new Error("请先上传图片并进行裁剪");
                }
                
                // 检查是否选择了自定义尺寸
                const ratioInput = document.getElementById('resize-ratio');
                if (ratioInput && ratioInput.value === 'custom') {
                    const customW = document.getElementById('resize-w');
                    const customH = document.getElementById('resize-h');
                    if (customW && customH && customW.value && customH.value) {
                        resizeData.target_width = parseInt(customW.value);
                        resizeData.target_height = parseInt(customH.value);
                        console.log(`[尺寸修改] 自定义尺寸: ${resizeData.target_width}x${resizeData.target_height}`);
                    }
                }

                result = await callAPI('/resize-image', resizeData);
                break;
            case 'expand':
                // 智能扩图：自动补全不完整的图片内容
                result = await callAPI('/expand-image', { 
                    image: uploadedFiles.expand
                });
                break;
            case 'logo':
                const logoData = {
                    base_image: uploadedFiles.logo.base,
                    logo_image: uploadedFiles.logo.logo
                };
                if (typeof logoParams !== 'undefined' && logoParams.mode === 'manual') {
                    logoData.manual = true;
                    logoData.size = logoParams.size;
                    logoData.margin_x = logoParams.x;
                    logoData.margin_y = logoParams.y;
                    logoData.position = logoParams.pos;
                }
                result = await callAPI('/logo-add', logoData);
                break;
            case 'migration':
                const migrationData = {
                    product_image: uploadedFiles.migration.product,
                    scene_image: uploadedFiles.migration.scene
                };
                const migrationInstruction = document.getElementById('migration-instruction').value.trim();
                if (migrationInstruction) {
                    migrationData.instruction = migrationInstruction;
                }
                result = await callAPI('/product-migration', migrationData);
                break;
            case 'watermark':
                result = await callAPI('/remove-watermark', { image: uploadedFiles.watermark });
                break;
        }
        
        if (result.success) {
            // 保存结果 URL
            resultUrls[type] = result.image_url;
            
            // 显示结果
            const resultImg = document.getElementById(`${type}-result-img`);
            const resultBox = document.getElementById(`${type}-result-box`);
            const resultActions = resultSection.querySelector('.result-actions');
            
            if (resultImg) {
                resultImg.src = result.image_url;
                resultImg.style.display = 'block';
                resultSection.style.display = 'block';
                
                // 移除 empty 类并隐藏占位文本
                if (resultBox) {
                    resultBox.classList.remove('empty');
                    const placeholder = resultBox.querySelector('p');
                    if (placeholder) placeholder.style.display = 'none';
                }
                
                // 显示操作按钮
                if (resultActions) {
                    resultActions.style.display = 'block';
                }
            }
            
            // 保存到历史记录
            addToHistory(type, result.image_url);
            
            showNotification('处理成功！', 'success');
        } else {
            showNotification(`处理失败：${result.error}`, 'error');
        }
        
    } catch (error) {
        console.error('处理错误:', error);
        showNotification(`处理失败：${error.message}`, 'error');
    } finally {
        // 隐藏加载动画
        loading.style.display = 'none';
        
        // 恢复按钮
        btn.disabled = false;
    }
}

function resetResize() {
    // 销毁裁剪器实例
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    
    // 切换显示区域
    const resizeUploadArea = document.getElementById('resize-upload-area');
    const resizeEditor = document.getElementById('resize-editor');
    const resizePreview = document.getElementById('resize-preview');
    const resizePlaceholder = document.querySelector('#resize-upload-area .upload-placeholder');
    const resizeInput = document.getElementById('resize-file');
    const resizeResetBtn = document.getElementById('resize-reset-btn');
    
    if (resizeUploadArea) {
        resizeUploadArea.style.display = 'flex';
        resizeUploadArea.classList.remove('has-image');
    }
    if (resizeEditor) resizeEditor.style.display = 'none';
    
    // 隐藏重新上传按钮
    if (resizeResetBtn) {
        resizeResetBtn.style.display = 'none';
    }
    
    // 清空预览图片
    if (resizePreview) {
        resizePreview.src = '';
        resizePreview.style.display = 'none';
    }
    
    // 显示占位符
    if (resizePlaceholder) {
        resizePlaceholder.style.display = 'block';
    }
    
    // 清空文件输入
    if (resizeInput) {
        resizeInput.value = '';
    }
    
    // 清空上传的文件
    uploadedFiles.resize = null;
    
    // 更新按钮状态
    updateProcessButton('resize');
}

// ==========================================
// 调用后端 API
// ==========================================
async function callAPI(endpoint, data) {
    const formData = new FormData();
    
    // 添加文件和其他数据
    for (const [key, value] of Object.entries(data)) {
        if (value instanceof File) {
            formData.append(key, value);
        } else {
            formData.append(key, value);
        }
    }
    
    const response = await fetch(API_BASE + endpoint, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error || response.statusText;
        throw new Error(`HTTP ${response.status}: ${errMsg}`);
    }
    
    return await response.json();
}

// ==========================================
// 下载图片（通过后端代理，避免跨域限制）
// ==========================================
async function downloadImage(type) {
    const url = resultUrls[type];
    if (!url) {
        showNotification('没有可下载的图片', 'error');
        return;
    }

    try {
        // 调用后端下载代理，拿到同源的二进制流，再触发浏览器保存
        const response = await fetch(API_BASE + '/download-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            showNotification(`下载失败：HTTP ${response.status}`, 'error');
            return;
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${type}_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // 释放 URL
        URL.revokeObjectURL(blobUrl);

        showNotification('下载已开始', 'success');
    } catch (error) {
        console.error('下载错误:', error);
        showNotification(`下载失败：${error.message}`, 'error');
    }
}

// ==========================================
// 通知提示
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
    
    // 创建遮罩层（半透明，不影响操作）
    const overlay = document.createElement('div');
    overlay.className = 'notification-overlay';
    
    // 创建弹窗（中间上方位置）
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

// 中间弹出提示框（用于批量操作）
function showToast(message, type = 'info', duration = 2000) {
    // 移除已存在的 toast 和遮罩
    const existingToast = document.querySelector('.toast-modal');
    const existingOverlay = document.querySelector('.toast-overlay');
    if (existingToast) {
        existingToast.remove();
    }
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'toast-overlay';
    
    // 创建弹窗
    const toast = document.createElement('div');
    toast.className = `toast-modal toast-${type}`;
    
    // 根据类型设置图标
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✗';
    if (type === 'warning') icon = '⚠';
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-message-text">${message}</div>
    `;
    
    // 添加到页面
    document.body.appendChild(overlay);
    document.body.appendChild(toast);
    
    // 触发动画（立即显示，不延迟）
    requestAnimationFrame(() => {
        toast.classList.add('toast-show');
        overlay.classList.add('toast-show');
    });
    
    // 自动移除
    setTimeout(() => {
        toast.classList.remove('toast-show');
        overlay.classList.remove('toast-show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
            if (overlay.parentNode) {
                overlay.remove();
            }
        }, 250);
    }, duration);
}

// ==========================================
// 拖拽上传支持
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const uploadBoxes = document.querySelectorAll('.upload-box');
    
    uploadBoxes.forEach(box => {
        box.addEventListener('click', (e) => {
            if (e.target.closest('.preview-remove-btn')) return;
            const input = box.querySelector('input[type="file"]');
            if (input) input.click();
        }, false);

        // 阻止默认拖拽行为
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            box.addEventListener(eventName, preventDefaults, false);
        });
        
        // 高亮拖拽区域
        ['dragenter', 'dragover'].forEach(eventName => {
            box.addEventListener(eventName, () => {
                box.style.borderColor = '#667eea';
                box.style.background = '#f0f4ff';
            }, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            box.addEventListener(eventName, () => {
                box.style.borderColor = '#ddd';
                box.style.background = '#fafafa';
            }, false);
        });
        
        // 处理拖拽文件
        box.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const input = box.querySelector('input[type="file"]');
                if (input) {
                    input.files = files;
                    input.dispatchEvent(new Event('change'));
                }
            }
        }, false);
    });
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// ==========================================
// AI 对话功能
// ==========================================
let chatUploadedImages = []; // 首页上传的多张图片
let currentChatId = null;
let chatSessions = JSON.parse(localStorage.getItem('chatSessions') || '{}');
let chatPageUploadedImages = []; // 对话页面上传的多张图片

function triggerImageUpload() {
    document.getElementById('chat-image-input').click();
}

function handleChatImageUpload(input) {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    
    // 验证文件
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showNotification('请只上传图片文件！', 'error');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            showNotification(`图片 ${file.name} 大小不能超过 5MB！`, 'error');
            return;
        }
    }
    
    // 限制最多上传5张图片
    if (chatUploadedImages.length + files.length > 5) {
        showNotification('最多只能上传 5 张图片！', 'error');
        return;
    }
    
    // 添加图片到数组
    chatUploadedImages.push(...files);
    
    // 更新预览
    updateHomeImagesPreview();
    
    // 更新数量徽章
    updateHomeImageCountBadge();
    
    // Auto模式下，上传图片后会自动选择支持图生图的模型（通过getActiveModelId实现）
    // 这里可以显示一个提示，告知用户Auto模式已自动切换到图生图模型
    if (modelAutoMode && chatUploadedImages.length > 0) {
        const activeModel = getActiveModelId(true);
        const modelName = MODEL_CONFIG[activeModel]?.name || '支持图生图的模型';
        // 可选：显示提示信息
        // showNotification(`Auto模式：已自动选择 ${modelName} 进行图生图处理`, 'info', 2000);
    }
}

function updateHomeImagesPreview() {
    const previewContainer = document.getElementById('home-images-preview');
    previewContainer.innerHTML = '';
    
    if (chatUploadedImages.length === 0) {
        previewContainer.style.display = 'none';
        return;
    }
    
    previewContainer.style.display = 'flex';
    
    chatUploadedImages.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'home-preview-item';
            itemDiv.innerHTML = `
                <img src="${e.target.result}" alt="预览${index + 1}">
                <button class="home-image-remove" onclick="removeHomeImageByIndex(${index})">×</button>
            `;
            previewContainer.appendChild(itemDiv);
        };
        reader.readAsDataURL(file);
    });
}

function updateHomeImageCountBadge() {
    const badge = document.getElementById('home-image-count-badge');
    if (chatUploadedImages.length > 0) {
        badge.textContent = chatUploadedImages.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function removeHomeImageByIndex(index) {
    chatUploadedImages.splice(index, 1);
    updateHomeImagesPreview();
    updateHomeImageCountBadge();
    
    // 如果没有图片了，清空 input
    if (chatUploadedImages.length === 0) {
        document.getElementById('chat-image-input').value = '';
    }
}

function clearAllHomeImages() {
    chatUploadedImages = [];
    document.getElementById('chat-image-input').value = '';
    updateHomeImagesPreview();
    updateHomeImageCountBadge();
}

// ==========================================
// 参考图上传处理 (用于图生图)
// ==========================================

// 处理首页参考图上传
function handleHomeRefImageUpload(input) {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    
    // 验证文件
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showNotification('请只上传图片文件！', 'error');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            showNotification(`图片 ${file.name} 大小不能超过 5MB！`, 'error');
            return;
        }
    }
    
    // 限制最多上传3张参考图
    if (homeRefImages.length + files.length > 3) {
        showNotification('最多只能上传 3 张参考图！', 'error');
        return;
    }
    
    // 添加图片到数组
    homeRefImages.push(...files);
    
    // 更新预览
    updateHomeRefImagesPreview();
    
    // 显示参考图区域
    document.getElementById('home-ref-section').style.display = 'block';
}

function updateHomeRefImagesPreview() {
    const previewContainer = document.getElementById('home-ref-images-preview');
    previewContainer.innerHTML = '';
    
    if (homeRefImages.length === 0) {
        document.getElementById('home-ref-section').style.display = 'none';
        return;
    }
    
    homeRefImages.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'ref-preview-item';
            itemDiv.style.cssText = 'position: relative; width: 80px; height: 80px;';
            itemDiv.innerHTML = `
                <img src="${e.target.result}" alt="参考图${index + 1}" 
                     style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #e5e7eb;">
                <button onclick="removeHomeRefImage(${index})" 
                        style="position: absolute; top: -8px; right: -8px; width: 24px; height: 24px; border-radius: 50%; 
                               background: #ef4444; color: white; border: none; cursor: pointer; font-size: 16px; 
                               display: flex; align-items: center; justify-content: center; line-height: 1;">×</button>
            `;
            previewContainer.appendChild(itemDiv);
        };
        reader.readAsDataURL(file);
    });
}

function removeHomeRefImage(index) {
    homeRefImages.splice(index, 1);
    updateHomeRefImagesPreview();
    
    if (homeRefImages.length === 0) {
        document.getElementById('home-ref-image-input').value = '';
    }
}

// 处理对话页面参考图上传
function handleChatRefImageUpload(input) {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    
    // 验证文件
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showNotification('请只上传图片文件！', 'error');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            showNotification(`图片 ${file.name} 大小不能超过 5MB！`, 'error');
            return;
        }
    }
    
    // 限制最多上传3张参考图
    if (chatRefImages.length + files.length > 3) {
        showNotification('最多只能上传 3 张参考图！', 'error');
        return;
    }
    
    // 添加图片到数组
    chatRefImages.push(...files);
    
    // 更新预览
    updateChatRefImagesPreview();
    
    // 显示参考图区域
    document.getElementById('chat-ref-section').style.display = 'block';
}

function updateChatRefImagesPreview() {
    const previewContainer = document.getElementById('chat-ref-images-preview');
    previewContainer.innerHTML = '';
    
    if (chatRefImages.length === 0) {
        document.getElementById('chat-ref-section').style.display = 'none';
        return;
    }
    
    chatRefImages.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'ref-preview-item';
            itemDiv.style.cssText = 'position: relative; width: 80px; height: 80px;';
            itemDiv.innerHTML = `
                <img src="${e.target.result}" alt="参考图${index + 1}" 
                     style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #e5e7eb;">
                <button onclick="removeChatRefImage(${index})" 
                        style="position: absolute; top: -8px; right: -8px; width: 24px; height: 24px; border-radius: 50%; 
                               background: #ef4444; color: white; border: none; cursor: pointer; font-size: 16px; 
                               display: flex; align-items: center; justify-content: center; line-height: 1;">×</button>
            `;
            previewContainer.appendChild(itemDiv);
        };
        reader.readAsDataURL(file);
    });
}

function removeChatRefImage(index) {
    chatRefImages.splice(index, 1);
    updateChatRefImagesPreview();
    
    if (chatRefImages.length === 0) {
        document.getElementById('chat-ref-image-input').value = '';
    }
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const prompt = input.value.trim();
    
    if (!prompt && chatUploadedImages.length === 0) {
        showNotification('请输入描述或上传图片', 'error');
        return;
    }
    
    // 创建新对话并跳转到对话页面（支持多张图片和参考图）
    startNewChatWithMessage(prompt, chatUploadedImages, homeRefImages);
    
    // 清空输入
    input.value = '';
    input.style.height = 'auto';
    clearAllHomeImages();
    
    // 清空参考图
    homeRefImages = [];
    updateHomeRefImagesPreview();
}

// ==========================================
// 对话页面功能
// ==========================================

function startNewChat() {
    currentChatId = Date.now().toString();
    chatSessions[currentChatId] = {
        id: currentChatId,
        title: '新对话',
        messages: [],
        createdAt: new Date().toISOString()
    };
    saveChatSessions();
    
    
    loadChatPage(currentChatId);
}

function startNewChatWithMessage(prompt, images, refImages = []) {
    currentChatId = Date.now().toString();
    chatSessions[currentChatId] = {
        id: currentChatId,
        title: prompt.substring(0, 30) || '图片对话',
        messages: [],
        createdAt: new Date().toISOString()
    };
    
    
    // 切换到对话页面
    showPage('chat');
    
    // 加载对话页面
    loadChatPage(currentChatId);
    
    // 发送第一条消息（支持多图片）
    sendFirstMessage(prompt, images);
}

async function sendFirstMessage(prompt, images) {
    const messagesContainer = document.getElementById('chat-messages');
    
    // 添加用户消息（不保存 base64 图片到 localStorage）
    const userMessage = {
        role: 'user',
        content: prompt,
        images: [],  // 不保存图片，节省空间
        timestamp: new Date().toISOString()
    };
    
    // 兼容单张图片（旧代码）
    if (images && !Array.isArray(images)) {
        images = [images];
    }
    
    if (images && images.length > 0) {
        // 读取所有图片的 base64（仅用于显示）
        const imagePromises = images.map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
            });
        });
        
        const imagesBase64 = await Promise.all(imagePromises);
        
        // 只在界面显示图片，不保存到 localStorage
        const displayMessage = { ...userMessage, images: imagesBase64 };
        appendMessage(displayMessage);
        sendToAI(prompt, images);
    } else {
        appendMessage(userMessage);
        sendToAI(prompt, null);
    }
    
    // 保存消息（不包含图片 base64）
    chatSessions[currentChatId].messages.push(userMessage);
    saveChatSessions();
}

function appendMessage(message) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${message.role}`;
    
    let avatarContent = message.role === 'user' ? 'U' : 'AI';
    
    // 构建图片HTML（支持多张图片）
    let imagesHtml = '';
    let imageUrls = []; // 收集所有图片URL
    
    // 兼容旧格式（单张图片）
    if (message.image) {
        imageUrls.push(message.image);
        const escapedImageUrl = message.image.replace(/'/g, "\\'");
        imagesHtml = `<div class="chat-image-wrapper">
            <div class="chat-image"><img src="${message.image}" alt="图片"></div>
            <div class="chat-image-actions">
                <button class="chat-image-btn add-to-input-btn" onclick="addImageToInput('${escapedImageUrl}')" title="添加到输入框">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    添加到输入框
                </button>
                ${message.role === 'assistant' ? `
                <button class="chat-image-btn download-btn" onclick="downloadChatImage('${escapedImageUrl}', 0)" title="下载图片">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/></svg>
                    下载
                </button>
                ` : ''}
            </div>
        </div>`;
    }
    // 新格式（多张图片）
    else if (message.images && message.images.length > 0) {
        imagesHtml = '<div class="chat-images-grid">';
        message.images.forEach((imgSrc, index) => {
            imageUrls.push(imgSrc);
            const escapedImgSrc = imgSrc.replace(/'/g, "\\'");
            imagesHtml += `<div class="chat-image-wrapper">
                <div class="chat-image"><img src="${imgSrc}" alt="图片${index + 1}"></div>
                <div class="chat-image-actions">
                    <button class="chat-image-btn add-to-input-btn" onclick="addImageToInput('${escapedImgSrc}')" title="添加到输入框">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                        添加到输入框
                    </button>
                    ${message.role === 'assistant' ? `
                    <button class="chat-image-btn download-btn" onclick="downloadChatImage('${escapedImgSrc}', ${index})" title="下载图片">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/></svg>
                        下载
                    </button>
                    ` : ''}
                </div>
            </div>`;
        });
        imagesHtml += '</div>';
    }
    
    // 文字在上，图片在下
    messageEl.innerHTML = `
        <div class="chat-avatar ${message.role}">${avatarContent}</div>
        <div class="chat-content">
            ${message.content ? `<div class="chat-bubble">${message.content}</div>` : ''}
            ${imagesHtml}
        </div>
    `;
    
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showLoadingMessage() {
    const messagesContainer = document.getElementById('chat-messages');
    const loadingEl = document.createElement('div');
    loadingEl.className = 'chat-message assistant';
    loadingEl.id = 'loading-message';
    loadingEl.innerHTML = `
        <div class="chat-avatar">AI</div>
        <div class="chat-content">
            <div class="chat-loading">
                <span>AI 正在思考</span>
                <div class="chat-loading-dots">
                    <div class="chat-loading-dot"></div>
                    <div class="chat-loading-dot"></div>
                    <div class="chat-loading-dot"></div>
                </div>
            </div>
        </div>
    `;
    messagesContainer.appendChild(loadingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeLoadingMessage() {
    const loadingEl = document.getElementById('loading-message');
    if (loadingEl) {
        loadingEl.remove();
    }
}

async function sendToAI(prompt, images, refImages = []) {
    showLoadingMessage();
    
    try {
        const formData = new FormData();
        
        // 支持多张图片
        if (images) {
            if (Array.isArray(images)) {
                // 多张图片
                images.forEach((img, index) => {
                    formData.append(`image${index}`, img);
                });
                formData.append('image_count', images.length);
            } else {
                // 单张图片（兼容旧代码）
                formData.append('image', images);
            }
        }
        
        // 支持参考图（用于图生图）
        if (refImages && Array.isArray(refImages) && refImages.length > 0) {
            refImages.forEach((img, index) => {
                formData.append(`ref_image${index}`, img);
            });
            formData.append('ref_image_count', refImages.length);
            console.log(`🖼️ 上传参考图: ${refImages.length} 张`);
        }
        
        if (prompt) {
            formData.append('prompt', prompt);
        }
        
        // 获取当前选择的模型ID
        const hasImages = images && (Array.isArray(images) ? images.length > 0 : true);
        const modelId = getActiveModelId(hasImages);
        formData.append('model_id', modelId);
        
        // 获取该模型的配置参数
        const modelConfig = getCurrentModelConfig(modelId);
        if (Object.keys(modelConfig).length > 0) {
            formData.append('model_config', JSON.stringify(modelConfig));
            console.log(`🤖 使用模型: ${modelId} (Auto: ${modelAutoMode}, 有图片: ${hasImages})`);
            console.log(`⚙️ 模型配置:`, modelConfig);
        } else {
            console.log(`🤖 使用模型: ${modelId} (Auto: ${modelAutoMode}, 有图片: ${hasImages})`);
        }
        
        const response = await fetch(API_BASE + '/chat', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        removeLoadingMessage();
        
        if (result.success) {
            const aiMessage = {
                role: 'assistant',
                content: result.message || '',
                image: result.image_url || null,
                timestamp: new Date().toISOString()
            };
            
            appendMessage(aiMessage);
            chatSessions[currentChatId].messages.push(aiMessage);
            saveChatSessions();
            updateChatHistory();
            
        } else {
            const errorMessage = {
                role: 'assistant',
                content: '抱歉，处理失败：' + (result.error || '未知错误'),
                image: null,
                timestamp: new Date().toISOString()
            };
            appendMessage(errorMessage);
        }
    } catch (error) {
        removeLoadingMessage();
        console.error('发送失败:', error);
        const errorMessage = {
            role: 'assistant',
            content: '抱歉，发送失败：' + error.message,
            image: null,
            timestamp: new Date().toISOString()
        };
        appendMessage(errorMessage);
    }
}

function loadChatPage(chatId) {
    currentChatId = chatId;
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '';
    
    const session = chatSessions[chatId];
    if (session && session.messages) {
        session.messages.forEach(msg => {
            appendMessage(msg);
        });
    }
    
    
    updateChatHistory();
}

function updateChatHistory() {
    const historyList = document.getElementById('chat-history-list');
    historyList.innerHTML = '';
    
    const sessions = Object.values(chatSessions).sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    if (sessions.length === 0) {
        historyList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无对话记录</div>';
        return;
    }
    
    sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'chat-history-item' + (session.id === currentChatId ? ' active' : '');
        
        const time = new Date(session.createdAt).toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        item.innerHTML = `
            <div class="chat-history-title">${session.title}</div>
            <div class="chat-history-time">${time}</div>
            <button class="chat-history-delete" onclick="deleteChatSession('${session.id}', event)">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
        `;
        
        item.querySelector('.chat-history-title').onclick = () => loadChatPage(session.id);
        item.querySelector('.chat-history-time').onclick = () => loadChatPage(session.id);
        
        historyList.appendChild(item);
    });
}

function deleteChatSession(chatId, event) {
    if (event) {
        event.stopPropagation();
    }
    
    if (confirm('确定要删除这个对话吗？')) {
        delete chatSessions[chatId];
        saveChatSessions();
        
        if (currentChatId === chatId) {
            const remainingSessions = Object.keys(chatSessions);
            if (remainingSessions.length > 0) {
                loadChatPage(remainingSessions[0]);
            } else {
                showPage('home');
            }
        } else {
            updateChatHistory();
        }
    }
}

function saveChatSessions() {
    try {
        localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.error('LocalStorage 配额已满');
            showNotification('聊天记录已满，建议清理旧对话', 'error');
            // 自动删除最旧的对话
            const sessions = Object.values(chatSessions);
            if (sessions.length > 1) {
                sessions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                const oldestId = sessions[0].id;
                delete chatSessions[oldestId];
                console.log('已自动删除最旧的对话:', oldestId);
                // 重试保存
                try {
                    localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
                    renderChatHistory();
                } catch (e2) {
                    console.error('即使删除旧对话后仍无法保存:', e2);
                }
            }
        } else {
            console.error('保存聊天记录失败:', e);
        }
    }
}

// 对话页面图片上传
function triggerChatPageImageUpload() {
    document.getElementById('chat-page-image-input').click();
}

function handleChatPageImageUpload(input) {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    
    // 验证文件
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showNotification('请只上传图片文件！', 'error');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            showNotification(`图片 ${file.name} 大小不能超过 5MB！`, 'error');
            return;
        }
    }
    
    // 限制最多上传5张图片
    if (chatPageUploadedImages.length + files.length > 5) {
        showNotification('最多只能上传 5 张图片！', 'error');
        return;
    }
    
    
    // 添加图片到数组
    chatPageUploadedImages.push(...files);
    
    // 更新预览
    updateChatPageImagesPreview();
    
    // 更新数量徽章
    updateImageCountBadge();
    
    // Auto模式下，上传图片后会自动选择支持图生图的模型（通过getActiveModelId实现）
    // 这里可以显示一个提示，告知用户Auto模式已自动切换到图生图模型
    if (modelAutoMode && chatPageUploadedImages.length > 0) {
        const activeModel = getActiveModelId(true);
        const modelName = MODEL_CONFIG[activeModel]?.name || '支持图生图的模型';
        // 可选：显示提示信息
        // showNotification(`Auto模式：已自动选择 ${modelName} 进行图生图处理`, 'info', 2000);
    }
}

function updateChatPageImagesPreview() {
    const previewContainer = document.getElementById('chat-page-images-preview');
    previewContainer.innerHTML = '';
    
    if (chatPageUploadedImages.length === 0) {
        previewContainer.style.display = 'none';
        return;
    }
    
    previewContainer.style.display = 'flex';
    
    chatPageUploadedImages.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'chat-page-preview-item';
            itemDiv.innerHTML = `
                <img src="${e.target.result}" alt="预览${index + 1}">
                <button class="chat-page-preview-remove" onclick="removeChatPageImageByIndex(${index})">×</button>
            `;
            previewContainer.appendChild(itemDiv);
        };
        reader.readAsDataURL(file);
    });
}

function updateImageCountBadge() {
    const badge = document.getElementById('image-count-badge');
    if (chatPageUploadedImages.length > 0) {
        badge.textContent = chatPageUploadedImages.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function removeChatPageImageByIndex(index) {
    chatPageUploadedImages.splice(index, 1);
    updateChatPageImagesPreview();
    updateImageCountBadge();
    
    // 如果没有图片了，清空 input
    if (chatPageUploadedImages.length === 0) {
        document.getElementById('chat-page-image-input').value = '';
        
        // Auto模式下，删除所有图片后会自动切换回文生图模型
        if (modelAutoMode) {
            const activeModel = getActiveModelId(false);
            const modelName = MODEL_CONFIG[activeModel]?.name || '文生图模型';
            // 可选：显示提示信息
            // showNotification(`Auto模式：已自动选择 ${modelName} 进行文生图`, 'info', 2000);
        }
    }
}

function clearAllChatPageImages() {
    chatPageUploadedImages = [];
    document.getElementById('chat-page-image-input').value = '';
    updateChatPageImagesPreview();
    updateImageCountBadge();
}

// 将图片添加到输入框（用于二次编辑）
async function addImageToInput(imageUrl) {
    try {
        // 检查是否超过限制
        if (chatPageUploadedImages.length >= 5) {
            showToast('最多只能添加 5 张图片！', 'error', 2000);
            return;
        }
        
        // 将图片URL转换为File对象
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        
        // 从URL中提取文件名，如果没有则使用默认名称
        const urlParts = imageUrl.split('/');
        const fileName = urlParts[urlParts.length - 1] || `image_${Date.now()}.png`;
        
        // 创建File对象
        const file = new File([blob], fileName, { type: blob.type || 'image/png' });
        
        // 验证文件大小
        if (file.size > 5 * 1024 * 1024) {
            showToast('图片大小不能超过 5MB！', 'error', 2000);
            return;
        }
        
        // 添加到数组
        chatPageUploadedImages.push(file);
        
        // 更新预览和计数
        updateChatPageImagesPreview();
        updateImageCountBadge();
        
        showToast(`✓ 已添加图片到输入框（${chatPageUploadedImages.length}/5）`, 'success', 1500);
        
    } catch (error) {
        console.error('添加图片到输入框失败:', error);
        showToast('添加图片失败，请重试', 'error', 2000);
    }
}

// 下载对话中的图片
async function downloadChatImage(imageUrl, index = 0) {
    try {
        showToast('正在下载图片...', 'info', 1000);
        
        // 获取图片
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 从URL中提取文件名
        const urlParts = imageUrl.split('/');
        let fileName = urlParts[urlParts.length - 1];
        
        // 如果URL包含查询参数，移除它们
        if (fileName.includes('?')) {
            fileName = fileName.split('?')[0];
        }
        
        // 如果没有文件名，使用默认名称
        if (!fileName || !fileName.includes('.')) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            fileName = `ai_image_${timestamp}_${index + 1}.png`;
        }
        
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // 清理URL对象
        URL.revokeObjectURL(url);
        
        showToast(`✓ 图片下载已开始`, 'success', 1500);
        
    } catch (error) {
        console.error('下载图片失败:', error);
        showToast('下载图片失败，请重试', 'error', 2000);
    }
}

async function sendChatPageMessage() {
    const input = document.getElementById('chat-page-input');
    const prompt = input.value.trim();
    
    // 检查是否有输入内容或上传的图片
    if (!prompt && chatPageUploadedImages.length === 0) {
        showNotification('请输入消息或上传图片', 'error');
        return;
    }
    
    // 添加用户消息
    const userMessage = {
        role: 'user',
        content: prompt,
        images: [],  // 改为数组
        timestamp: new Date().toISOString()
    };
    
    // 情况1：用户上传了新图片（可能多张）
    if (chatPageUploadedImages.length > 0) {
        // 读取所有图片的 base64（仅用于显示，不保存到localStorage）
        const imagePromises = chatPageUploadedImages.map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
            });
        });
        
        const imagesBase64 = await Promise.all(imagePromises);
        userMessage.images = imagesBase64;
        
        appendMessage(userMessage);
        
        // 不保存图片的 base64 到 localStorage，只保存文字
        const messageToSave = {
            ...userMessage,
            images: []  // 清空图片数据
        };
        chatSessions[currentChatId].messages.push(messageToSave);
        saveChatSessions();
        
        // 发送到 AI（多张图片 + 参考图）
        sendToAI(prompt, chatPageUploadedImages, chatRefImages);
        clearAllChatPageImages();
        
        // 清空参考图
        chatRefImages = [];
        updateChatRefImagesPreview();
    } 
    // 情况2：只有文字，没有图片
    else {
        appendMessage(userMessage);
        chatSessions[currentChatId].messages.push(userMessage);
        saveChatSessions();
        sendToAI(prompt, null);
    }
    
    // 清空输入
    input.value = '';
    input.style.height = 'auto';
}

async function downloadImageUrl(url) {
    try {
        const response = await fetch(API_BASE + '/download-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            showNotification(`下载失败：HTTP ${response.status}`, 'error');
            return;
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `ai_chat_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(blobUrl);

        showNotification('下载已开始', 'success');
    } catch (error) {
        console.error('下载错误:', error);
        showNotification(`下载失败：${error.message}`, 'error');
    }
}

// ==========================================
// 模型选择器功能
// ==========================================

// 模型配置（现在从后端 API 动态加载）
const MODEL_CONFIG = {
    'gemini-3-pro': {
        name: 'Gemini 3 Pro',
        description: '图片编辑处理',
        supportsImageToImage: true  // 支持图生图
    }
};

// 从 localStorage 加载设置
let modelAutoMode = localStorage.getItem('model_auto_mode') !== 'false'; // 默认 true
let selectedModelId = localStorage.getItem('model_selected_id') || 'gemini-3-pro';

// 页面加载时初始化模型选择器
document.addEventListener('DOMContentLoaded', function() {
    // 先从API加载模型列表
    loadModelsFromAPI().then(() => {
    initModelSelector('home');
    initModelSelector('chat');
    
    // 初始化图片上传功能显示状态（延迟执行，确保DOM已加载）
    setTimeout(() => {
        toggleImageUploadByModel('home');
        toggleImageUploadByModel('chat');
    }, 100);
    });
    
    // 点击外部关闭模型选择器
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.model-selector-container')) {
            closeAllModelSelectors();
        }
    });
});

function initModelSelector(context) {
    // 设置 Auto 开关状态
    const autoCheckbox = document.getElementById(`${context}-auto-mode`);
    if (autoCheckbox) {
        autoCheckbox.checked = modelAutoMode;
    }
    
    // 更新显示
    updateModelDisplay(context);
    updateModelList(context);
}

function toggleModelSelector(context) {
    const btn = document.getElementById(`${context}-model-selector-btn`);
    const menu = document.getElementById(`${context}-model-selector-menu`);
    
    if (!menu) return;
    
    const isOpen = menu.style.display === 'block';
    
    // 关闭所有其他选择器
    closeAllModelSelectors();
    
    if (!isOpen) {
        menu.style.display = 'block';
        btn.classList.add('active');
    }
}

function closeAllModelSelectors() {
    ['home', 'chat'].forEach(context => {
        const menu = document.getElementById(`${context}-model-selector-menu`);
        const btn = document.getElementById(`${context}-model-selector-btn`);
        if (menu) menu.style.display = 'none';
        if (btn) btn.classList.remove('active');
    });
}

function toggleAutoMode(context, checked) {
    modelAutoMode = checked;
    localStorage.setItem('model_auto_mode', checked);
    
    // 更新所有上下文的显示
    updateModelDisplay('home');
    updateModelDisplay('chat');
    
    // 更新模型列表（Auto 开启时禁用手动选择）
    updateModelList('home');
    updateModelList('chat');
    
    // 根据Auto模式更新图片上传功能
    // Auto模式下，根据当前是否有图片来决定模型，然后控制上传功能
    toggleImageUploadByModel('home');
    toggleImageUploadByModel('chat');
}

function selectModel(context, modelId) {
    if (modelAutoMode) return; // Auto 模式下不允许手动选择
    
    selectedModelId = modelId;
    localStorage.setItem('model_selected_id', modelId);
    
    // 更新所有上下文的显示
    updateModelDisplay('home');
    updateModelDisplay('chat');
    updateModelList('home');
    updateModelList('chat');
    
    // 根据模型更新图片上传功能
    toggleImageUploadByModel('home');
    toggleImageUploadByModel('chat');
    
    // 关闭菜单
    closeAllModelSelectors();
}

function updateModelDisplay(context) {
    const nameElement = document.getElementById(`${context}-model-name`);
    if (!nameElement) return;
    
    if (modelAutoMode) {
        nameElement.textContent = 'Auto';
    } else {
        const model = MODEL_CONFIG[selectedModelId];
        nameElement.textContent = model ? model.name : 'Unknown';
    }
}

// 从API加载模型列表
async function loadModelsFromAPI() {
    try {
        const response = await fetch(API_BASE + '/models');
        const data = await response.json();
        
        if (data.success && data.models) {
            // 更新 MODEL_CONFIG
            Object.keys(data.models).forEach(modelId => {
                const model = data.models[modelId];
                MODEL_CONFIG[modelId] = {
                    name: model.display_name || model.name,
                    description: model.description || '',
                    supportsImageToImage: model.category && model.category.includes('图生图')
                };
            });
            
            // 渲染模型列表到两个位置（首页和对话页）
            renderModelList('home', data.models);
            renderModelList('chat', data.models);
            
            console.log('[模型] 已加载', Object.keys(data.models).length, '个模型');
        }
    } catch (error) {
        console.error('[模型] 加载失败:', error);
    }
}

// 渲染模型列表
function renderModelList(context, models) {
    const modelList = document.getElementById(`${context}-model-list`);
    if (!modelList) return;
    
    // 清空现有列表（保留第一个 Gemini 3 Pro 作为默认）
    const existingItems = modelList.querySelectorAll('.model-item');
    existingItems.forEach((item, index) => {
        if (index > 0) { // 保留第一个
            item.remove();
        }
    });
    
    // 添加所有模型
    Object.keys(models).forEach(modelId => {
        // 跳过已存在的 Gemini 3 Pro
        if (modelId === 'gemini-3-pro' && existingItems.length > 0) {
            return;
        }
        
        const model = models[modelId];
        const modelItem = document.createElement('div');
        modelItem.className = 'model-item';
        modelItem.setAttribute('data-model-id', modelId);
        modelItem.onclick = () => selectModel(context, modelId);
        
        const category = model.category || '';
        const categoryText = category ? ` (${category})` : '';
        
        modelItem.innerHTML = `
            <div class="model-item-icon">✓</div>
            <div class="model-item-info">
                <div class="model-item-name">${model.display_name || model.name}</div>
                <div class="model-item-desc">${model.description || categoryText}</div>
            </div>
            <button class="model-item-config-btn" onclick="event.stopPropagation(); openModelConfigByModelId('${modelId}')" title="配置 ${model.display_name || model.name}">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                </svg>
            </button>
        `;
        
        modelList.appendChild(modelItem);
    });
    
    // 更新选中状态
    updateModelList(context);
}

function updateModelList(context) {
    const modelList = document.getElementById(`${context}-model-list`);
    if (!modelList) return;
    
    const items = modelList.querySelectorAll('.model-item');
    items.forEach(item => {
        const modelId = item.getAttribute('data-model-id');
        
        // Auto 模式下禁用所有项
        if (modelAutoMode) {
            item.classList.remove('selected');
            item.classList.add('disabled');
        } else {
            item.classList.remove('disabled');
            if (modelId === selectedModelId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        }
    });
}

function getActiveModelId(hasImages) {
    if (modelAutoMode) {
        // Auto 模式：默认使用 Gemini，或第一个可用的 Jiekou 模型
        return hasImages ? 'gemini-3-pro' : (Object.keys(MODEL_CONFIG)[1] || 'gemini-3-pro');
    } else {
        // 手动模式：使用用户选择的模型
        return selectedModelId;
    }
}

// 根据模型显示/隐藏图片上传功能
function toggleImageUploadByModel(context) {
    // 获取上传按钮和输入框
    let uploadBtn, imageInput, imagePreview;
    
    if (context === 'home') {
        uploadBtn = document.querySelector('.chat-plus-btn');
        imageInput = document.getElementById('chat-image-input');
        imagePreview = document.getElementById('home-images-preview');
    } else if (context === 'chat') {
        uploadBtn = document.querySelector('.chat-attach-btn');
        imageInput = document.getElementById('chat-page-image-input');
        imagePreview = document.getElementById('chat-page-images-preview');
    }
    
    if (!uploadBtn || !imageInput) return;
    
    // Auto模式下始终显示上传按钮（因为Auto模式会根据是否有图片自动选择模型）
    if (modelAutoMode) {
        uploadBtn.style.display = 'flex';
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '1';
        uploadBtn.style.cursor = 'pointer';
        uploadBtn.style.pointerEvents = 'auto';
        
        // 更新placeholder提示
        const textarea = context === 'home' 
            ? document.getElementById('chat-input')
            : document.getElementById('chat-page-input');
        if (textarea) {
            if (context === 'home') {
                textarea.placeholder = '输入一句描述让AI帮你设计... (可上传多张图片)';
            } else {
                textarea.placeholder = '输入消息... (可上传多张图片)';
            }
        }
        return;
    }
    
    // 手动模式下，根据选择的模型决定是否显示上传按钮
    const activeModelId = selectedModelId;
    const modelConfig = MODEL_CONFIG[activeModelId];
    
    // 判断模型是否支持图生图
    const supportsI2I = modelConfig && modelConfig.supportsImageToImage === true;
    
    if (supportsI2I) {
        // 支持图生图：显示上传按钮
        uploadBtn.style.display = 'flex';
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '1';
        uploadBtn.style.cursor = 'pointer';
        uploadBtn.style.pointerEvents = 'auto';
        
        // 更新placeholder提示
        const textarea = context === 'home' 
            ? document.getElementById('chat-input')
            : document.getElementById('chat-page-input');
        if (textarea) {
            if (context === 'home') {
                textarea.placeholder = '输入一句描述让AI帮你设计... (可上传多张图片)';
            } else {
                textarea.placeholder = '输入消息... (可上传多张图片)';
            }
        }
    } else {
        // 仅文生图：隐藏上传按钮
        uploadBtn.style.display = 'none';
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = '0.5';
        uploadBtn.style.cursor = 'not-allowed';
        uploadBtn.style.pointerEvents = 'none';
        
        // 清空已上传的图片（如果模型不支持图生图）
        if (context === 'home' && chatUploadedImages.length > 0) {
            chatUploadedImages = [];
            if (typeof updateHomeImagesPreview === 'function') {
                updateHomeImagesPreview();
            }
            if (typeof updateHomeImageCountBadge === 'function') {
                updateHomeImageCountBadge();
            }
        } else if (context === 'chat' && chatPageUploadedImages.length > 0) {
            chatPageUploadedImages = [];
            if (typeof updateChatPageImagesPreview === 'function') {
                updateChatPageImagesPreview();
            }
            if (typeof updateChatPageImageCountBadge === 'function') {
                updateChatPageImageCountBadge();
            }
        }
        
        // 更新placeholder提示
        const textarea = context === 'home' 
            ? document.getElementById('chat-input')
            : document.getElementById('chat-page-input');
        if (textarea) {
            if (context === 'home') {
                textarea.placeholder = '输入一句描述让AI帮你生成图片...';
            } else {
                textarea.placeholder = '输入消息...';
            }
        }
    }
}

// ==========================================
// 模型配置管理
// ==========================================

// 存储当前模型配置
let modelConfigs = {};
let currentConfigContext = '';
let currentConfigModelId = '';

// 从 localStorage 加载模型配置
function loadModelConfigs() {
    const saved = localStorage.getItem('model_configs');
    if (saved) {
        try {
            modelConfigs = JSON.parse(saved);
            
            // 清理旧的风格预设参数（已废弃）
            const excludedKeys = ['styleUUID', 'style_ids', 'styleIds'];
            let hasChanges = false;
            
            Object.keys(modelConfigs).forEach(modelId => {
                const config = modelConfigs[modelId];
                excludedKeys.forEach(key => {
                    if (key in config) {
                        delete config[key];
                        hasChanges = true;
                        console.log(`已清理模型 ${modelId} 的废弃参数: ${key}`);
                    }
                });
            });
            
            // 如果有清理，保存回 localStorage
            if (hasChanges) {
                saveModelConfigs();
            }
        } catch (e) {
            console.error('加载模型配置失败:', e);
            modelConfigs = {};
        }
    }
}

// 保存模型配置到 localStorage
function saveModelConfigs() {
    localStorage.setItem('model_configs', JSON.stringify(modelConfigs));
}

// 通过模型ID打开配置弹窗（从模型选项点击）
async function openModelConfigByModelId(modelId) {
    currentConfigModelId = modelId;
    
    // 关闭模型选择菜单
    closeAllModelSelectors();
    
    // 移除硬编码检查，让所有模型都能加载配置
    await loadAndDisplayConfig(modelId);
}

// 打开模型配置弹窗（旧函数，保留兼容性）
async function openModelConfig(context) {
    currentConfigContext = context;
    
    // 获取当前选择的模型ID
    const modelId = modelAutoMode ? (Object.keys(MODEL_CONFIG)[0] || 'gemini-3-pro') : selectedModelId;
    currentConfigModelId = modelId;
    
    // 如果是Auto模式，提示用户
    if (modelAutoMode) {
        showNotification('Auto模式下，将配置当前选择的模型', 'info');
    }
    
    // 移除硬编码检查，让所有模型都能加载配置
    await loadAndDisplayConfig(modelId);
}

// 加载并显示配置（公共函数）
async function loadAndDisplayConfig(modelId) {
    
    try {
        // 获取模型配置定义
        const url = `${API_BASE}/models/${modelId}/config`;
        console.log('[配置] 请求URL:', url);
        console.log('[配置] API_BASE:', API_BASE);
        console.log('[配置] modelId:', modelId);
        
        const response = await fetch(url);
        console.log('[配置] 响应状态:', response.status);
        console.log('[配置] 响应类型:', response.headers.get('content-type'));
        
        // 检查响应状态
        if (!response.ok) {
            const text = await response.text();
            console.error('[配置] 响应错误:', response.status, response.statusText);
            console.error('[配置] 响应内容:', text.substring(0, 500));
            showNotification(`API错误 ${response.status}: ${response.statusText}`, 'error');
            return;
        }
        
        // 检查响应类型
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('[配置] API返回非JSON响应:', contentType);
            console.error('[配置] 响应内容:', text.substring(0, 500));
            showNotification('API返回错误，请检查服务器日志', 'error');
            return;
        }
        
        const result = await response.json();
        
        if (!result.success) {
            showNotification('获取模型配置失败: ' + result.error, 'error');
            return;
        }
        
        const config = result.config;
        
        // 如果模型没有配置参数
        if (!config.parameters || config.parameters.length === 0) {
            showNotification(`${config.model_name} 暂无可配置参数`, 'info');
            return;
        }
        
        // 设置标题
        document.getElementById('model-config-title').textContent = `${config.model_name} 配置`;
        
        // 生成配置表单
        const configBody = document.getElementById('model-config-body');
        configBody.innerHTML = '';
        
        // 确保该模型有配置对象
        if (!modelConfigs[modelId]) {
            modelConfigs[modelId] = {};
        }
        
        // 存储宽高比和尺寸选择器的引用，用于控制禁用状态
        let aspectRatioSelect = null;
        let sizeSelect = null;
        let originalSizeRatioSwitch = null;
        
        config.parameters.forEach(param => {
            const configItem = document.createElement('div');
            configItem.className = 'config-item';
            
            const label = document.createElement('label');
            label.className = 'config-label';
            label.textContent = param.label;
            configItem.appendChild(label);
            
            // 根据参数类型创建不同的输入控件
            if (param.type === 'number') {
                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'config-input';
                input.min = param.min;
                input.max = param.max;
                input.step = param.step;
                input.value = modelConfigs[modelId][param.name] !== undefined ? 
                    modelConfigs[modelId][param.name] : param.default;
                input.dataset.paramName = param.name;
                configItem.appendChild(input);
            } else if (param.type === 'select') {
                const select = document.createElement('select');
                select.className = 'config-select';
                select.dataset.paramName = param.name;
                
                param.options.forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option.value;
                    opt.textContent = option.label;
                    select.appendChild(opt);
                });
                
                select.value = modelConfigs[modelId][param.name] !== undefined ? 
                    modelConfigs[modelId][param.name] : param.default;
                
                // 保存宽高比和尺寸选择器的引用
                if (param.name === 'aspect_ratio') {
                    aspectRatioSelect = select;
                } else if (param.name === 'size') {
                    sizeSelect = select;
                }
                
                configItem.appendChild(select);
            } else if (param.type === 'text') {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'config-input';
                input.value = modelConfigs[modelId][param.name] !== undefined ? 
                    modelConfigs[modelId][param.name] : param.default;
                input.dataset.paramName = param.name;
                input.placeholder = param.description || '';
                configItem.appendChild(input);
            } else if (param.type === 'switch') {
                const switchDiv = document.createElement('div');
                switchDiv.className = 'config-switch';
                
                const switchLabel = document.createElement('label');
                switchLabel.className = 'config-switch-label';
                
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = modelConfigs[modelId][param.name] !== undefined ? 
                    modelConfigs[modelId][param.name] : param.default;
                input.dataset.paramName = param.name;
                
                // 保存"原图比例尺寸"开关的引用
                if (param.name === 'use_original_size_ratio') {
                    originalSizeRatioSwitch = input;
                }
                
                const slider = document.createElement('span');
                slider.className = 'config-switch-slider';
                
                switchLabel.appendChild(input);
                switchLabel.appendChild(slider);
                switchDiv.appendChild(switchLabel);
                
                const switchText = document.createElement('span');
                switchText.className = 'config-switch-text';
                switchText.textContent = input.checked ? '开启' : '关闭';
                switchDiv.appendChild(switchText);
                
                // 切换文字和控制其他选项的禁用状态
                input.addEventListener('change', function() {
                    switchText.textContent = this.checked ? '开启' : '关闭';
                    
                    // 如果是"原图比例尺寸"开关，控制宽高比和尺寸选择器的禁用状态
                    if (param.name === 'use_original_size_ratio') {
                        if (aspectRatioSelect) {
                            aspectRatioSelect.disabled = this.checked;
                            aspectRatioSelect.style.opacity = this.checked ? '0.5' : '1';
                        }
                        if (sizeSelect) {
                            sizeSelect.disabled = this.checked;
                            sizeSelect.style.opacity = this.checked ? '0.5' : '1';
                        }
                    }
                });
                
                configItem.appendChild(switchDiv);
            } else if (param.type === 'switch_number') {
                // 开关+数字输入组合类型
                const switchNumberContainer = document.createElement('div');
                switchNumberContainer.className = 'config-switch-number';
                
                // 创建开关部分
                const switchDiv = document.createElement('div');
                switchDiv.className = 'config-switch';
                
                const switchLabel = document.createElement('label');
                switchLabel.className = 'config-switch-label';
                
                const switchInput = document.createElement('input');
                switchInput.type = 'checkbox';
                // 检查是否已启用（通过检查是否有值或enabled字段）
                const enabledKey = `${param.name}_enabled`;
                const valueKey = param.name;
                const isEnabled = modelConfigs[modelId][enabledKey] !== undefined ? 
                    modelConfigs[modelId][enabledKey] : 
                    (param.enabled_default !== undefined ? param.enabled_default : false);
                switchInput.checked = isEnabled;
                switchInput.dataset.paramName = enabledKey;
                
                const slider = document.createElement('span');
                slider.className = 'config-switch-slider';
                
                switchLabel.appendChild(switchInput);
                switchLabel.appendChild(slider);
                switchDiv.appendChild(switchLabel);
                
                const switchText = document.createElement('span');
                switchText.className = 'config-switch-text';
                switchText.textContent = switchInput.checked ? '开启' : '关闭';
                switchDiv.appendChild(switchText);
                
                // 创建数字输入部分
                const numberInputContainer = document.createElement('div');
                numberInputContainer.className = 'config-number-container';
                numberInputContainer.style.display = switchInput.checked ? 'block' : 'none';
                
                const numberInput = document.createElement('input');
                numberInput.type = 'number';
                numberInput.className = 'config-input';
                numberInput.min = param.min;
                numberInput.max = param.max;
                numberInput.step = param.step;
                numberInput.value = modelConfigs[modelId][valueKey] !== undefined ? 
                    modelConfigs[modelId][valueKey] : param.default;
                numberInput.dataset.paramName = valueKey;
                numberInput.disabled = !switchInput.checked;
                
                numberInputContainer.appendChild(numberInput);
                
                // 开关切换事件
                switchInput.addEventListener('change', function() {
                    switchText.textContent = this.checked ? '开启' : '关闭';
                    numberInput.disabled = !this.checked;
                    numberInputContainer.style.display = this.checked ? 'block' : 'none';
                });
                
                switchNumberContainer.appendChild(switchDiv);
                switchNumberContainer.appendChild(numberInputContainer);
                configItem.appendChild(switchNumberContainer);
            }
            
            // 添加描述
            if (param.description) {
                const desc = document.createElement('div');
                desc.className = 'config-description';
                desc.textContent = param.description;
                configItem.appendChild(desc);
            }
            
            configBody.appendChild(configItem);
        });
        
        // 初始化时设置宽高比和尺寸选择器的禁用状态（如果"原图比例尺寸"开关已开启）
        if (originalSizeRatioSwitch && originalSizeRatioSwitch.checked) {
            if (aspectRatioSelect) {
                aspectRatioSelect.disabled = true;
                aspectRatioSelect.style.opacity = '0.5';
            }
            if (sizeSelect) {
                sizeSelect.disabled = true;
                sizeSelect.style.opacity = '0.5';
            }
        }
        
        // 显示弹窗
        document.getElementById('model-config-modal').style.display = 'flex';
        
    } catch (error) {
        console.error('[配置] 打开模型配置失败:', error);
        console.error('[配置] 错误详情:', error.stack);
        showNotification('打开模型配置失败: ' + error.message, 'error');
    }
}

// 关闭模型配置弹窗
function closeModelConfig() {
    document.getElementById('model-config-modal').style.display = 'none';
}

// 保存模型配置
function saveModelConfig() {
    const configBody = document.getElementById('model-config-body');
    const inputs = configBody.querySelectorAll('[data-param-name]');
    
    if (!modelConfigs[currentConfigModelId]) {
        modelConfigs[currentConfigModelId] = {};
    }
    
    inputs.forEach(input => {
        const paramName = input.dataset.paramName;
        
        if (input.type === 'checkbox') {
            modelConfigs[currentConfigModelId][paramName] = input.checked;
        } else if (input.type === 'number') {
            // 检查是否是 switch_number 类型的数字输入
            const isSwitchNumber = input.closest('.config-switch-number') !== null;
            if (isSwitchNumber) {
                // switch_number 类型的数字输入，需要检查对应的开关状态
                const switchInput = input.closest('.config-switch-number').querySelector('input[type="checkbox"]');
                if (switchInput && switchInput.checked) {
                    modelConfigs[currentConfigModelId][paramName] = parseFloat(input.value);
                } else {
                    // 开关关闭时，不保存数值或保存为 null
                    modelConfigs[currentConfigModelId][paramName] = null;
                }
            } else {
                modelConfigs[currentConfigModelId][paramName] = parseFloat(input.value);
            }
        } else if (input.tagName === 'SELECT') {
            // 尝试转换为数字，如果失败则保持字符串
            const value = input.value;
            modelConfigs[currentConfigModelId][paramName] = isNaN(value) ? value : parseFloat(value);
        } else {
            modelConfigs[currentConfigModelId][paramName] = input.value;
        }
    });
    
    saveModelConfigs();
    closeModelConfig();
    showNotification('配置已保存', 'success');
    
    console.log('已保存模型配置:', modelConfigs[currentConfigModelId]);
}

// 重置模型配置
async function resetModelConfig() {
    if (!confirm('确定要恢复默认配置吗？')) {
        return;
    }
    
    // 清空该模型的配置
    delete modelConfigs[currentConfigModelId];
    saveModelConfigs();
    
    // 重新打开配置窗口
    closeModelConfig();
    setTimeout(() => {
        openModelConfig(currentConfigContext);
    }, 100);
    
    showNotification('已恢复默认配置', 'success');
}

// 获取当前模型的配置
function getCurrentModelConfig(modelId) {
    const config = modelConfigs[modelId] || {};
    const filteredConfig = {};
    
    // 需要完全排除的参数（风格预设相关，已废弃）
    const excludedKeys = ['styleUUID', 'style_ids', 'styleIds'];
    
    // 过滤配置，对于 switch_number 类型，如果开关关闭则不传递该参数
    Object.keys(config).forEach(key => {
        // 排除风格预设相关参数
        if (excludedKeys.includes(key)) {
            return;
        }
        
        // 检查是否是 image_guidance 的 enabled 字段
        if (key === 'image_guidance_enabled') {
            // enabled 字段本身不传递给API，只用于控制是否传递 image_guidance
            return;
        } else if (key === 'image_guidance') {
            // 检查对应的开关状态
            const enabledKey = 'image_guidance_enabled';
            if (config[enabledKey] === false || config[enabledKey] === undefined) {
                // 开关关闭，不传递该参数
                return;
            }
            // 开关开启，传递数值
            filteredConfig[key] = config[key];
        } else {
            // 其他参数正常传递
            filteredConfig[key] = config[key];
        }
    });
    
    return filteredConfig;
}

// 页面加载时初始化
loadModelConfigs();

// ==========================================

// ==========================================
// 调试信息
// ==========================================
console.log('🎨 AI 图像处理助手已加载');
console.log('📡 API 地址:', API_BASE);

// ==========================================
// 戳戳秀生成器
// ==========================================

// 戳戳秀数据存储
let pokeArtData = {
    images: [],
    imageSizes: [], // 存储每张图片的尺寸 {width, height}
    results: []
};

// 打开戳戳秀模型配置
async function openPokeArtModelConfig() {
    const modelSelect = document.getElementById('poke-art-model');
    if (!modelSelect) return;
    
    const modelId = modelSelect.value;
    
    // 调用现有的模型配置函数
    await openModelConfigByModelId(modelId);
}

// 加载戳戳秀页面的模型列表
async function loadPokeArtModels() {
    try {
        const response = await fetch(API_BASE + '/models');
        const data = await response.json();
        
        if (data.success && data.models) {
            const modelSelect = document.getElementById('poke-art-model');
            if (!modelSelect) return;
            
            // 清空现有选项（保留第一个作为默认）
            const currentValue = modelSelect.value;
            modelSelect.innerHTML = '';
            
            // 筛选支持图生图的模型
            const imageToImageModels = Object.keys(data.models).filter(modelId => {
                const model = data.models[modelId];
                return model.category && (
                    model.category.includes('图生图') || 
                    model.category.includes('文生图 + 图生图')
                );
            });
            
            // 添加模型选项
            imageToImageModels.forEach(modelId => {
                const model = data.models[modelId];
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = model.display_name || model.name;
                if (modelId === currentValue || (modelId === 'gemini-3-pro' && !currentValue)) {
                    option.selected = true;
                }
                modelSelect.appendChild(option);
            });
            
            console.log('[戳戳秀] 已加载', imageToImageModels.length, '个图生图模型');
        }
    } catch (error) {
        console.error('[戳戳秀] 加载模型失败:', error);
    }
}

// 戳戳秀风格系统提示词
const POKE_ART_SYSTEM_PROMPT = `Transform the image into a warm and adorable "Poke Art" (戳戳秀) style with these characteristics:

TEXTURE & MATERIAL:
- Soft, fluffy yarn texture with visible fiber strands
- Natural wool/cotton material appearance
- Gentle, rounded stitching patterns
- Tactile, handmade craft quality
- Slightly fuzzy edges and organic shapes

COLOR PALETTE:
- Warm, cozy, pastel tones
- Soft gradients between colors
- Natural yarn colors (cream, beige, soft pink, light blue, mint green)
- Avoid harsh contrasts, use gentle color transitions
- Slightly muted, comforting hues

STYLE ELEMENTS:
- Simplified, cute, and friendly shapes
- Rounded edges and soft contours
- Embroidered details for facial features or patterns
- Circular hoop frame (optional, like an embroidery hoop)
- Handcrafted, artisanal aesthetic
- Kawaii/cute character interpretation

LIGHTING & DEPTH:
- Soft, diffused natural lighting
- Gentle shadows that enhance texture
- Slight 3D relief effect showing yarn thickness
- Warm ambient light creating cozy atmosphere

COMPOSITION:
- Centered subject within circular or square frame
- Clean, neutral background (beige, cream, or soft pastels)
- Focus on the main subject with yarn texture
- Maintain recognizable features while simplifying

TECHNICAL DETAILS:
- High detail in yarn texture and stitching
- Visible individual yarn strands
- Natural fiber imperfections
- Handmade quality, not machine-perfect
- Soft focus on background, sharp on subject

The final result should look like a lovingly handcrafted yarn art piece, warm and inviting, perfect for home decoration or gifts.`;

// 处理戳戳秀图片上传
function handlePokeArtUpload(input) {
    const newFiles = Array.from(input.files).filter(f => f.type.startsWith('image/'));
    
    if (newFiles.length === 0) {
        showToast('请选择图片文件', 'error');
        return;
    }
    
    // 获取已有的文件
    const existingFiles = pokeArtData.images || [];
    const existingSizes = pokeArtData.imageSizes || [];
    
    // 累加新文件
    const allFiles = [...existingFiles, ...newFiles];
    
    // 检查总数是否超过10张
    if (allFiles.length > 10) {
        showToast(`最多只能上传10张图片\n当前已有 ${existingFiles.length} 张，本次选择 ${newFiles.length} 张，超出限制`, 'error', 3000);
        input.value = '';
        return;
    }
    
    // 解析新图片的尺寸
    const newSizes = [];
    let loadedCount = 0;
    
    newFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                newSizes[index] = { width: img.width, height: img.height };
                loadedCount++;
                
                // 所有图片尺寸都解析完成后
                if (loadedCount === newFiles.length) {
                    // 保存累加后的文件列表和尺寸
    pokeArtData.images = allFiles;
                    pokeArtData.imageSizes = [...existingSizes, ...newSizes];
    
    // 显示所有图片预览
    displayPokeArtPreviews(allFiles);
    
    // 更新按钮状态
    updatePokeArtButton();
                    
                    console.log('[戳戳秀] 图片尺寸:', pokeArtData.imageSizes);
                }
            };
            img.onerror = () => {
                newSizes[index] = null;
                loadedCount++;
                if (loadedCount === newFiles.length) {
                    pokeArtData.images = allFiles;
                    pokeArtData.imageSizes = [...existingSizes, ...newSizes];
                    displayPokeArtPreviews(allFiles);
                    updatePokeArtButton();
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
    
    // 清空 input
    input.value = '';
}

// 显示戳戳秀图片预览
function displayPokeArtPreviews(files) {
    const previewsContainer = document.getElementById('poke-art-previews');
    const emptyHint = document.getElementById('poke-art-empty-hint');
    const countBadge = document.getElementById('poke-art-count');
    
    if (!previewsContainer || !emptyHint || !countBadge) return;
    
    // 清空现有预览
    previewsContainer.innerHTML = '';
    
    if (files.length === 0) {
        emptyHint.style.display = 'block';
        previewsContainer.style.display = 'none';
        countBadge.textContent = '0/10';
        return;
    }
    
    emptyHint.style.display = 'none';
    previewsContainer.style.display = 'grid';
    countBadge.textContent = `${files.length}/10`;
    
    // 为每个文件创建预览
    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'batch-mini-preview-item';
            const imgUrl = e.target.result;
            // 转义单引号，防止 onclick 中的 URL 包含单引号导致错误
            const escapedUrl = imgUrl.replace(/'/g, "\\'");
            previewItem.innerHTML = `
                <img src="${imgUrl}" alt="预览 ${index + 1}" onclick="showImageLightbox('${escapedUrl}')">
                <button class="batch-mini-preview-remove" onclick="removePokeArtImage(${index}, event)">×</button>
                <div class="batch-mini-preview-number">${index + 1}</div>
            `;
            previewsContainer.appendChild(previewItem);
        };
        reader.readAsDataURL(file);
    });
}

// 移除戳戳秀图片
function removePokeArtImage(index, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    pokeArtData.images.splice(index, 1);
    if (pokeArtData.imageSizes) {
        pokeArtData.imageSizes.splice(index, 1);
    }
    displayPokeArtPreviews(pokeArtData.images);
    updatePokeArtButton();
}

// 更新戳戳秀生成按钮状态
function updatePokeArtButton() {
    const processBtn = document.getElementById('poke-art-process-btn');
    if (!processBtn) return;
    
    const hasImages = pokeArtData.images.length > 0;
    processBtn.disabled = !hasImages;
    
    if (hasImages) {
        processBtn.textContent = `开始生成戳戳秀 (${pokeArtData.images.length}张)`;
    } else {
        processBtn.textContent = '开始生成戳戳秀';
    }
}

// 处理戳戳秀生成
async function processPokeArt() {
    const images = pokeArtData.images;
    // 从选择器获取模型ID
    const modelSelect = document.getElementById('poke-art-model');
    const modelId = modelSelect ? modelSelect.value : 'gemini-3-pro';
    const userPrompt = document.getElementById('poke-art-prompt')?.value?.trim() || '';
    
    if (images.length === 0) {
        showToast('请先上传图片', 'error');
        return;
    }
    
    // 用户提示词现在是可选的（后端会自动添加专业系统提示词）
    // 如果用户有补充说明，会一起发送给后端
    const fullPrompt = userPrompt || 'poke art style';  // 即使为空也发送一个标记，让后端识别为戳戳秀模式
    
    console.log('[戳戳秀] 🧶 Gemini 3 Pro 专用模式');
    
    // 显示进度条
    const progressDiv = document.getElementById('poke-art-progress');
    const progressBar = document.getElementById('poke-art-progress-bar');
    const progressText = document.getElementById('poke-art-progress-text');
    const processBtn = document.getElementById('poke-art-process-btn');
    const resultDiv = document.getElementById('poke-art-result');
    const resultsGrid = document.getElementById('poke-art-results-grid');
    const downloadSection = document.getElementById('poke-art-download-section');
    
    progressDiv.style.display = 'block';
    processBtn.disabled = true;
    resultDiv.style.display = 'none';
    resultsGrid.style.display = 'none';
    downloadSection.style.display = 'none';
    
    // 清空之前的结果
    pokeArtData.results = [];
    resultsGrid.innerHTML = '';
    
    // 并发处理所有图片
    console.log(`[戳戳秀] 开始并发处理 ${images.length} 张图片...`);
    
    // 创建所有请求的Promise数组
    const promises = images.map((file, index) => {
        return new Promise(async (resolve) => {
            const imageIndex = index + 1;
        
        try {
            // 创建 FormData
            const formData = new FormData();
                formData.append('prompt', fullPrompt);
                formData.append('image', file);
            formData.append('model_id', modelId);
            
            // 获取模型配置
            const modelConfig = getCurrentModelConfig(modelId);
            
            // 传递原图尺寸信息（无论是否使用）
            if (pokeArtData.imageSizes && pokeArtData.imageSizes[index]) {
                const imgSize = pokeArtData.imageSizes[index];
                modelConfig.original_width = imgSize.width;
                modelConfig.original_height = imgSize.height;
                
                // 如果开启了"原图比例尺寸"开关，确保使用原图尺寸
                if (modelConfig.use_original_size_ratio) {
                    // 不需要额外处理，后端会根据开关判断
                }
                // 兼容旧逻辑：如果选择了"原图尺寸"
                else if (modelConfig.size === 'original') {
                    modelConfig.use_original_size = true;
                    delete modelConfig.size;
                }
            }
            
            if (Object.keys(modelConfig).length > 0) {
                formData.append('model_config', JSON.stringify(modelConfig));
            }
            
                // 发送请求（并发）
            const response = await fetch(API_BASE + '/chat', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success && result.image_url) {
                    resolve({
                    success: true,
                    url: result.image_url,
                        index: imageIndex
                });
            } else {
                    resolve({
                    success: false,
                    error: result.error || '生成失败',
                        index: imageIndex
                });
            }
            
        } catch (error) {
                console.error(`处理第 ${imageIndex} 张图片失败:`, error);
                resolve({
                success: false,
                error: error.message,
                    index: imageIndex
                });
            }
        });
    });
    
    // 跟踪完成数量（用于实时进度显示）
    let completedCount = 0;
    const totalCount = images.length;
    
    // 为每个Promise添加完成回调，实时更新进度
    const promisesWithProgress = promises.map((promise, index) => {
        return promise.then((result) => {
            completedCount++;
            
            // 更新进度
            const progress = (completedCount / totalCount * 100).toFixed(0);
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `已完成 ${completedCount}/${totalCount} 张...`;
            
            // 保存结果到对应的索引位置，确保顺序
            const resultIndex = result.index - 1;
            pokeArtData.results[resultIndex] = result;
            
            return result;
        });
    });
    
    // 等待所有请求完成（并发处理）
    await Promise.all(promisesWithProgress);
    
    // 完成后，按原始上传顺序显示所有结果
    progressBar.style.width = '100%';
    const successCount = pokeArtData.results.filter(r => r && r.success).length;
    progressText.textContent = `完成！成功生成 ${successCount}/${images.length} 张`;
    
    // 清空结果容器（使用已声明的 resultsGrid 变量）
    resultsGrid.innerHTML = '';
    
    // 按上传顺序显示所有结果
    pokeArtData.results.forEach((result, index) => {
        if (result) {
            if (result.success) {
                displayPokeArtResult(result.url, result.index);
            } else {
                displayPokeArtError(result.error, result.index);
            }
        }
    });
    
    setTimeout(() => {
        progressDiv.style.display = 'none';
        processBtn.disabled = false;
        
        // 显示下载按钮
        if (pokeArtData.results.some(r => r.success)) {
            downloadSection.style.display = 'flex';
        }
        
        // 注意：不清空参考图，保留供用户继续使用
        // 用户可以通过点击删除按钮手动移除参考图
    }, 1500);
}

// 显示戳戳秀生成结果
function displayPokeArtResult(imageUrl, index) {
    const resultDiv = document.getElementById('poke-art-result');
    const resultsGrid = document.getElementById('poke-art-results-grid');
    
    resultDiv.style.display = 'none';
    resultsGrid.style.display = 'grid';
    
    const resultItem = document.createElement('div');
    resultItem.className = 'batch-result-item';
    
    // 转义单引号，防止 onclick 中的 URL 包含单引号导致错误
    const escapedUrl = imageUrl.replace(/'/g, "\\'");
    
    resultItem.innerHTML = `
        <div class="batch-result-number">${index}</div>
        <img src="${imageUrl}" alt="戳戳秀 ${index}" onclick="showImageLightbox('${escapedUrl}')">
        <div class="result-item-actions">
            <button class="result-item-download" onclick="event.stopPropagation(); downloadSingleImage('${escapedUrl}', 'poke-art-${index}.png')">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/></svg>
                下载
            </button>
        </div>
    `;
    resultsGrid.appendChild(resultItem);
}

// 显示戳戳秀生成错误
function displayPokeArtError(errorMsg, index) {
    const resultDiv = document.getElementById('poke-art-result');
    const resultsGrid = document.getElementById('poke-art-results-grid');
    
    resultDiv.style.display = 'none';
    resultsGrid.style.display = 'grid';
    
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item result-item-error';
    resultItem.innerHTML = `
        <div class="result-item-number">${index}</div>
        <div class="result-error-content">
            <svg viewBox="0 0 24 24" width="32" height="32" style="color: #e53e3e; margin-bottom: 8px;">
                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <p style="font-size: 12px; color: #666;">${errorMsg}</p>
        </div>
    `;
    resultsGrid.appendChild(resultItem);
}

// 显示图片放大模态框
function showImageLightbox(imageUrl) {
    // 创建或获取模态框
    let lightbox = document.getElementById('image-lightbox');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'image-lightbox';
        lightbox.className = 'image-lightbox';
        lightbox.innerHTML = `
            <div class="image-lightbox-content">
                <button class="image-lightbox-close" onclick="closeImageLightbox()">×</button>
                <img src="" alt="放大预览">
            </div>
        `;
        document.body.appendChild(lightbox);
        
        // 点击背景关闭
        lightbox.addEventListener('click', function(e) {
            if (e.target === lightbox) {
                closeImageLightbox();
            }
        });
        
        // ESC键关闭
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && lightbox.classList.contains('active')) {
                closeImageLightbox();
            }
        });
    }
    
    // 设置图片并显示
    const img = lightbox.querySelector('img');
    img.src = imageUrl;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden'; // 防止背景滚动
}

// 关闭图片放大模态框
function closeImageLightbox() {
    const lightbox = document.getElementById('image-lightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
        document.body.style.overflow = ''; // 恢复滚动
    }
}

// 下载戳戳秀打包文件
async function downloadPokeArtZip() {
    const successResults = pokeArtData.results.filter(r => r.success);
    
    if (successResults.length === 0) {
        showToast('没有可下载的图片', 'error');
        return;
    }
    
    const urls = successResults.map(r => r.url);
    
    try {
        showToast('正在打包下载...', 'info', 1500);
        
        const response = await fetch(API_BASE + '/download-batch-zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                urls: urls,
                name: `poke_art_${Date.now()}`
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `poke_art_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('下载成功！', 'success');
    } catch (error) {
        console.error('打包下载失败:', error);
        showToast('打包下载失败: ' + error.message, 'error');
    }
}

// 下载单张图片（用于戳戳秀结果右下角“下载”按钮）
async function downloadSingleImage(imageUrl, filename = 'image.png') {
    try {
        // 优先同源直接下载（更快）
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) {
        // 回退：用 fetch + blob（跨域/某些浏览器 download 属性失效时）
        try {
            const resp = await fetch(imageUrl, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('下载失败:', err);
            showToast('下载失败: ' + (err.message || '未知错误'), 'error');
        }
    }
}

// ==========================================
// Chat & Video Generation Logic (Removed)
// ==========================================
// Video generation features have been removed.


function removeImage(type, imageIndex = null, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    // 特殊处理 resize 类型，需要销毁裁剪器
    if (type === 'resize') {
        resetResize();
        return;
    }

    let previewId, uploadId, inputId;
    if (['background', 'logo', 'migration'].includes(type)) {
        previewId = `${type}-preview${imageIndex}`;
        uploadId = `${type}-upload${imageIndex}`;
        inputId = `${type}-file${imageIndex}`;
    } else {
        previewId = `${type}-preview`;
        uploadId = `${type}-upload`;
        inputId = `${type}-file`;
    }

    const preview = document.getElementById(previewId);
    const uploadBox = document.getElementById(uploadId);
    const placeholder = uploadBox ? uploadBox.querySelector('.upload-placeholder') : null;
    const input = document.getElementById(inputId);

    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'block';
    if (input) input.value = '';
    
    // 移除 has-image 类以隐藏删除按钮
    if (uploadBox) {
        uploadBox.classList.remove('has-image');
    }

    if (type === 'background') {
        if (imageIndex === 1) uploadedFiles.background.subject = null;
        if (imageIndex === 2) uploadedFiles.background.background = null;
    } else if (type === 'logo') {
        if (imageIndex === 1) uploadedFiles.logo.base = null;
        if (imageIndex === 2) uploadedFiles.logo.logo = null;
    } else if (type === 'migration') {
        if (imageIndex === 1) uploadedFiles.migration.product = null;
        if (imageIndex === 2) uploadedFiles.migration.scene = null;
    } else {
        uploadedFiles[type] = null;
    }

    updateProcessButton(type);
}

// ==========================================
// 处理记录功能
// ==========================================

// 获取处理类型的中文名称
function getProcessTypeName(type) {
    const typeNames = {
        'defects': '瑕疵修复',
        'upscale': '清晰度增强',
        'extract': '图案提取',
        'text': '文字替换',
        'background': '背景替换',
        'resize': '尺寸修改',
        'expand': '智能扩图',
        'logo': 'Logo添加',
        'migration': '产品迁移',
        'watermark': '水印去除'
    };
    return typeNames[type] || type;
}

// 添加到历史记录
function addToHistory(type, imageUrl) {
    const historyItem = {
        id: Date.now(),
        type: type,
        typeName: getProcessTypeName(type),
        imageUrl: imageUrl,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleString('zh-CN')
    };
    
    processHistory.unshift(historyItem);
    
    // 限制历史记录数量为100条
    if (processHistory.length > 100) {
        processHistory = processHistory.slice(0, 100);
    }
    
    saveHistory();
    console.log('已添加到历史记录:', historyItem);
}

// 保存历史记录到 localStorage
function saveHistory() {
    try {
        localStorage.setItem('processHistory', JSON.stringify(processHistory));
    } catch (e) {
        console.error('保存历史记录失败:', e);
    }
}

// 从 localStorage 加载历史记录
function loadHistory() {
    try {
        const saved = localStorage.getItem('processHistory');
        if (saved) {
            processHistory = JSON.parse(saved);
            console.log('已加载历史记录:', processHistory.length, '条');
        }
    } catch (e) {
        console.error('加载历史记录失败:', e);
        processHistory = [];
    }
}

// 渲染历史记录到页面
function renderHistory() {
    const grid = document.getElementById('history-grid');
    const empty = document.getElementById('empty-history');
    
    if (!grid) return;
    
    if (processHistory.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    
    if (empty) empty.style.display = 'none';
    
    grid.innerHTML = processHistory.map(item => `
        <div class="history-item" data-id="${item.id}">
            <div class="history-image-wrapper">
                <img src="${item.imageUrl}" alt="${item.typeName}" class="history-image">
            </div>
            <div class="history-info">
                <div class="history-type">${item.typeName}</div>
                <div class="history-date">${item.date}</div>
            </div>
            <div class="history-actions">
                <button class="history-action-btn" onclick="downloadHistoryImage('${item.imageUrl}', '${item.typeName}')" title="下载">
                    <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/></svg>
                </button>
                <button class="history-action-btn delete" onclick="deleteHistoryItem(${item.id})" title="删除">
                    <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>
        </div>
    `).join('');
}

// 下载历史记录中的图片
function downloadHistoryImage(url, typeName) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${typeName}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 删除单条历史记录
function deleteHistoryItem(id) {
    processHistory = processHistory.filter(item => item.id !== id);
    saveHistory();
    renderHistory();
    showNotification('已删除记录', 'success');
}

// 清空历史记录
function clearHistory() {
    if (!confirm('确定要清空所有历史记录吗？')) {
        return;
    }
    
    processHistory = [];
    saveHistory();
    renderHistory();
    showNotification('已清空历史记录', 'success');
}

// ==========================================
// Logo处理功能
// ==========================================
let logoParams = {
    mode: 'auto', // 'auto' or 'manual'
    x: 5,
    y: 5,
    size: 30,
    pos: 'mc' // middle-center
};

function toggleLogoMode(checked) {
    logoParams.mode = checked ? 'manual' : 'auto';
    const paramsPanel = document.getElementById('logo-params');
    const canvasWrapper = document.getElementById('logo-canvas-wrapper');
    const resultBox = document.getElementById('logo-result-box');
    const resultActions = document.querySelector('#logo-result .result-actions');
    
    if (checked) {
        paramsPanel.style.display = 'block';
        canvasWrapper.style.display = 'flex';
        if (resultBox) resultBox.style.display = 'none';
        if (resultActions) resultActions.style.display = 'none';
        drawLogoCanvas();
    } else {
        paramsPanel.style.display = 'none';
        canvasWrapper.style.display = 'none';
        if (resultBox) resultBox.style.display = 'flex';
        // If result exists, show actions
        const resultImg = document.getElementById('logo-result-img');
        if (resultImg && resultImg.src && resultImg.style.display !== 'none') {
             if (resultActions) resultActions.style.display = 'block';
        }
    }
}

function setLogoPosition(pos) {
    logoParams.pos = pos;
    // Update Grid UI
    document.querySelectorAll('.grid-cell').forEach(cell => {
        if (cell.dataset.pos === pos) {
            cell.classList.add('active');
        } else {
            cell.classList.remove('active');
        }
    });
    drawLogoCanvas();
}

function updateLogoParam(key, value) {
    logoParams[key] = parseInt(value);
    // Update Label
    if (key === 'size') document.getElementById('val-size').textContent = value + '%';
    if (key === 'x') document.getElementById('val-x').textContent = value + '%';
    if (key === 'y') document.getElementById('val-y').textContent = value + '%';
    drawLogoCanvas();
}

function drawLogoCanvas() {
    if (logoParams.mode !== 'manual') return;
    
    const canvas = document.getElementById('logo-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Get Images
    const basePreview = document.getElementById('logo-preview1');
    const logoPreview = document.getElementById('logo-preview2');
    
    if (!basePreview || !logoPreview || !basePreview.src || !logoPreview.src || basePreview.style.display === 'none' || logoPreview.style.display === 'none') {
        canvas.style.display = 'none';
        return;
    }
    
    canvas.style.display = 'block';
    
    // Limit canvas size for preview
    const maxWidth = 800;
    const maxHeight = 600;
    
    let w = basePreview.naturalWidth;
    let h = basePreview.naturalHeight;
    
    // Scale down if too big
    if (w > maxWidth || h > maxHeight) {
        const ratio = Math.min(maxWidth / w, maxHeight / h);
        w = Math.floor(w * ratio);
        h = Math.floor(h * ratio);
    }
    
    canvas.width = w;
    canvas.height = h;
    
    // Draw Base
    ctx.drawImage(basePreview, 0, 0, w, h);
    
    // Draw Logo
    const logoW = logoPreview.naturalWidth;
    const logoH = logoPreview.naturalHeight;
    if (logoW === 0 || logoH === 0) return;
    const logoAspect = logoW / logoH;
    
    // Target Logo Width relative to Base Width
    let targetLogoW = w * (logoParams.size / 100);
    let targetLogoH = targetLogoW / logoAspect;
    
    // Calculate Position
    let x = 0;
    let y = 0;
    
    const marginX = w * (logoParams.x / 100);
    const marginY = h * (logoParams.y / 100);
    
    // Horizontal
    if (logoParams.pos.includes('l')) { // Left
        x = marginX;
    } else if (logoParams.pos.includes('r')) { // Right
        x = w - targetLogoW - marginX;
    } else { // Center
        x = (w - targetLogoW) / 2;
    }
    
    // Vertical
    if (logoParams.pos.includes('t')) { // Top
        y = marginY;
    } else if (logoParams.pos.includes('b')) { // Bottom
        y = h - targetLogoH - marginY;
    } else { // Middle
        y = (h - targetLogoH) / 2;
    }
    
    ctx.drawImage(logoPreview, x, y, targetLogoW, targetLogoH);
}

// ==========================================
// 批量处理功能
// ==========================================

// 批量处理数据存储
const batchData = {
    background: {
        sourceImages: [],
        targetImage: null,
        results: []
    },
    migration: {
        sourceImages: [],
        targetImage: null,
        results: []
    }
};

// 处理文件夹上传（多张原图）- 支持累加上传
function handleBatchFolderUpload(type, input) {
    const newFiles = Array.from(input.files).filter(f => f.type.startsWith('image/'));
    
    if (newFiles.length === 0) {
        showToast('请选择图片文件', 'error');
        return;
    }
    
    // 获取已有的文件
    const existingFiles = batchData[type].sourceImages || [];
    
    // 累加新文件
    const allFiles = [...existingFiles, ...newFiles];
    
    // 检查总数是否超过8张
    if (allFiles.length > 8) {
        showToast(`最多只能上传8张图片\n当前已有 ${existingFiles.length} 张，本次选择 ${newFiles.length} 张，超出限制`, 'error', 3000);
        input.value = ''; // 清空本次选择
        return;
    }
    
    // 保存累加后的文件列表
    batchData[type].sourceImages = allFiles;
    
    // 显示所有图片预览
    displayBatchSourcePreviews(type, allFiles);
    
    // 更新按钮状态
    updateBatchProcessButton(type);
    
    // 清空 input，以便下次可以选择相同文件
    input.value = '';
    
    // 延迟显示提示，避免阻塞操作
    setTimeout(() => {
        showToast(`✓ 已添加 ${newFiles.length} 张图片，当前共 ${allFiles.length}/8 张`, 'success', 1200);
    }, 300);
}

// 处理单张目标图上传（背景图或目标场景图）
function handleBatchTargetUpload(type, input) {
    const file = input.files[0];
    
    if (!file || !file.type.startsWith('image/')) {
        showNotification('请选择图片文件', 'error');
        return;
    }
    
    batchData[type].targetImage = file;
    displayBatchTargetPreview(type, file);
    updateBatchProcessButton(type);
}

// 显示原图预览（网格）- 支持删除单张，保证顺序
function displayBatchSourcePreviews(type, files) {
    const prefix = type === 'background' ? 'batch-bg' : 'batch-mg';
    const container = document.getElementById(`${prefix}-source-previews`);
    const emptyHint = document.getElementById(`${prefix}-empty-hint`);
    const countBadge = document.getElementById(`${prefix}-count`);
    
    if (!container) return;
    
    // 更新计数
    if (countBadge) {
        countBadge.textContent = `${files.length}/8`;
    }
    
    if (files.length === 0) {
        container.style.display = 'none';
        if (emptyHint) emptyHint.style.display = 'block';
        return;
    }
    
    // 隐藏空提示，显示预览网格
    if (emptyHint) emptyHint.style.display = 'none';
    container.style.display = 'grid';
    container.innerHTML = '';
    
    // 创建占位符数组，确保按顺序显示
    const previews = new Array(files.length);
    let loadedCount = 0;
    
    files.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'batch-mini-preview-item';
            div.setAttribute('data-index', idx);
            
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = `Image ${idx+1}`;
            
            const numberLabel = document.createElement('div');
            numberLabel.className = 'batch-mini-preview-number';
            numberLabel.textContent = idx + 1;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'batch-mini-preview-remove';
            removeBtn.textContent = '×';
            removeBtn.onclick = (event) => removeBatchImage(type, idx, event);
            removeBtn.title = '删除';
            
            div.appendChild(img);
            div.appendChild(numberLabel);
            div.appendChild(removeBtn);
            
            previews[idx] = div;
            loadedCount++;
            
            // 所有图片加载完成后，按顺序添加到 DOM
            if (loadedCount === files.length) {
                previews.forEach(previewDiv => {
                    if (previewDiv) container.appendChild(previewDiv);
                });
            }
        };
        reader.readAsDataURL(file);
    });
}

// 显示目标图预览
function displayBatchTargetPreview(type, file) {
    const prefix = type === 'background' ? 'batch-bg' : 'batch-mg';
    const previewImg = document.getElementById(`${prefix}-target-preview`);
    const previewContainer = document.getElementById(`${prefix}-target-preview-container`);
    const emptyHint = document.getElementById(`${prefix}-target-empty-hint`);
    
    const reader = new FileReader();
    reader.onload = (e) => {
        if (previewImg) {
            previewImg.src = e.target.result;
        }
        
        // 隐藏空提示，显示预览
        if (emptyHint) emptyHint.style.display = 'none';
        if (previewContainer) previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// 更新处理按钮状态
function updateBatchProcessButton(type) {
    const prefix = type === 'background' ? 'batch-bg' : 'batch-mg';
    const btn = document.getElementById(`${prefix}-process-btn`);
    const clearBtn = document.getElementById(`${prefix}-clear-btn`);
    const data = batchData[type];
    
    btn.disabled = !(data.sourceImages.length > 0 && data.targetImage);
    
    // 显示/隐藏清空按钮
    if (clearBtn) {
        clearBtn.style.display = data.sourceImages.length > 0 ? 'inline-block' : 'none';
    }
}

// 轮询批量处理进度
async function pollProgress(taskId, type, progressBar, progressText, total) {
    const maxPolls = 300; // 最多轮询300次 (5分钟)
    const pollInterval = 1000; // 每秒轮询一次
    
    for (let i = 0; i < maxPolls; i++) {
        try {
            const response = await fetch(`${API_BASE}/batch-progress/${taskId}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const progress = await response.json();
            
            // 更新进度条（如果提供了进度条参数）
            if (progressBar && progressText) {
                const current = progress.current || 0;
                const percentage = Math.min(20 + (current / total) * 70, 90); // 20%-90%
                progressBar.style.width = `${percentage}%`;
                progressText.textContent = `处理中... ${current}/${total}（成功：${progress.succeeded}，失败：${progress.failed}）`;
            }
            
            // 检查是否完成
            if (progress.status === 'completed') {
                if (progressBar) progressBar.style.width = '100%';
                if (progressText) progressText.textContent = `处理完成！`;
                // 返回完整的进度对象（包含 results）
                return {
                    status: 'completed',
                    total: progress.total,
                    current: progress.current,
                    succeeded: progress.succeeded,
                    failed: progress.failed,
                    results: progress.results || []
                };
            }
            
            if (progress.status === 'failed') {
                throw new Error(progress.error || '处理失败');
            }
            
            // 等待下次轮询
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            
        } catch (error) {
            console.error('轮询进度错误:', error);
            // 继续轮询，除非是致命错误
            if (i >= maxPolls - 1) {
                throw error;
            }
        }
    }
    
    throw new Error('处理超时，请稍后查看结果');
}

// 简化的轮询函数（不更新进度条，只等待结果）
async function pollProgressForResult(taskId, type) {
    return await pollProgress(taskId, type, null, null, 0);
}

// 批量处理（逐张循环处理，实时进度）
async function processBatch(type) {
    const prefix = type === 'background' ? 'batch-bg' : 'batch-mg';
    const data = batchData[type];
    
    // 检查图片完整性 - 支持单产品模式和多产品模式
    let isValid = false;
    if (type === 'background' && bgReplaceMode === 'single') {
        // 单产品模式：需要1张产品图和至少1张背景图
        isValid = data.sourceImages.length === 1 && 
                  data.targetImages && 
                  data.targetImages.length > 0;
    } else {
        // 多产品模式或产品迁移：需要原图和目标图
        isValid = data.sourceImages.length > 0 && data.targetImage;
    }
    
    if (!isValid) {
        if (type === 'background' && bgReplaceMode === 'single') {
            if (data.sourceImages.length === 0) {
                showToast('请上传产品图', 'error');
            } else if (!data.targetImages || data.targetImages.length === 0) {
                showToast('请上传至少1张背景图', 'error');
            } else {
                showToast('请上传完整的图片', 'error');
            }
        } else {
            showToast('请上传完整的图片', 'error');
        }
        return;
    }
    
    // 隐藏进度条，使用居中加载动画
    const progressDiv = document.getElementById(`${prefix}-progress`);
    const processBtn = document.getElementById(`${prefix}-process-btn`);
    
    // 隐藏进度条
    if (progressDiv) progressDiv.style.display = 'none';
    
    // 显示居中加载动画
    showBatchLoading('正在替换，请耐心等待...');
    processBtn.disabled = true;
    
    try {
        // 单产品模式：需要循环处理每张背景图
        if (type === 'background' && bgReplaceMode === 'single') {
            await processBatchBackgroundSingle(data, prefix, null, null, progressDiv, processBtn);
            return;
        }
        
        // 构建 FormData（多产品模式）
        const formData = new FormData();
        
        // 添加所有原图
        data.sourceImages.forEach((file, idx) => {
            formData.append('source_images', file);
        });
        
        // 添加目标图
        const targetKey = type === 'background' ? 'background_image' : 'target_image';
        formData.append(targetKey, data.targetImage);
        
        // 调用 API
        const endpoint = type === 'background' 
            ? '/batch-replace-background'
            : '/batch-product-migration';
        
        // 启动后台处理（不等待）
        const fetchPromise = fetch(API_BASE + endpoint, {
            method: 'POST',
            body: formData
        });
        
        // 等待后台任务启动
        const response = await fetchPromise;
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const initialResult = await response.json();
        const taskId = initialResult.task_id;
        
        // 如果后端已经返回完整结果（同步处理完成），直接使用
        if (initialResult.success && initialResult.results) {
            // 隐藏加载动画
            hideBatchLoading();
            
            data.results = initialResult.results || [];
            displayBatchResults(type, initialResult);
            
            showToast(
                `✓ 处理完成！成功：${initialResult.succeeded}，失败：${initialResult.failed}`,
                initialResult.failed === 0 ? 'success' : 'warning',
                2500
            );
            
            processBtn.disabled = false;
            return;
        }
        
        // 如果后端返回了 task_id，说明是异步处理，需要轮询
        if (!taskId) {
            throw new Error(initialResult.error || '处理失败：未返回任务ID');
        }
        
        // 轮询进度（不使用进度条，只等待结果）
        const progressResult = await pollProgressForResult(taskId, type);
        
        // 隐藏加载动画
        hideBatchLoading();
        
        // 轮询返回的进度对象需要转换为结果格式
        const result = {
            success: progressResult.status === 'completed',
            total: progressResult.total,
            succeeded: progressResult.succeeded,
            failed: progressResult.failed,
            results: progressResult.results || []
        };
        
        if (result.success) {
            data.results = result.results || [];
            displayBatchResults(type, result);
            
            showToast(
                `✓ 处理完成！成功：${result.succeeded}，失败：${result.failed}`,
                result.failed === 0 ? 'success' : 'warning',
                2500
            );
        } else {
            throw new Error(progressResult.error || '处理失败');
        }
        
        processBtn.disabled = false;
        
    } catch (error) {
        console.error('批量处理错误:', error);
        hideBatchLoading();
        showToast(`✗ 处理失败：${error.message}`, 'error', 3000);
        processBtn.disabled = false;
    }
}

// 显示批量处理结果
function displayBatchResults(type, result) {
    const prefix = type === 'background' ? 'batch-bg' : 'batch-mg';
    const grid = document.getElementById(`${prefix}-results-grid`);
    const emptyState = document.getElementById(`${prefix}-result`);
    const downloadSection = document.getElementById(`${prefix}-download-section`);
    
    if (!grid) return;
    
    // 隐藏空状态
    if (emptyState) {
        emptyState.style.display = 'none';
    }
    
    grid.innerHTML = '';
    grid.style.display = 'grid';
    
    result.results.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'batch-result-item';
        
        if (item.success) {
            div.innerHTML = `
                <img src="${item.url}" alt="Result ${idx+1}">
                <div class="batch-result-number">${idx+1}</div>
            `;
        } else {
            div.innerHTML = `
                <div style="aspect-ratio: 1; display: flex; align-items: center; justify-content: center; background: #f8f8f8; flex-direction: column; padding: 20px;">
                    <span style="font-size: 32px; margin-bottom: 10px;">❌</span>
                    <p style="font-size: 13px; color: #999; text-align: center;">${item.error || '处理失败'}</p>
                </div>
                <div class="batch-result-number">${idx+1}</div>
            `;
        }
        
        grid.appendChild(div);
    });
    
    // 显示下载按钮
    if (downloadSection) {
        downloadSection.style.display = 'block';
    }
}

// 删除单张批量上传的图片
function removeBatchImage(type, index, event) {
    event.stopPropagation();
    
    const files = batchData[type].sourceImages;
    
    if (!files || index >= files.length) return;
    
    // 移除指定索引的文件
    files.splice(index, 1);
    
    // 更新数据
    batchData[type].sourceImages = files;
    
    // 重新显示预览
    displayBatchSourcePreviews(type, files);
    
    // 更新按钮状态
    updateBatchProcessButton(type);
    
    showToast(`✓ 已删除图片，剩余 ${files.length}/8 张`, 'info', 1500);
}

// 清空所有批量上传的图片
function clearBatchTarget(type, event) {
    if (event) {
        event.stopPropagation();
    }
    
    batchData[type].targetImage = null;
    const prefix = type === 'background' ? 'batch-bg' : 'batch-mg';
    const previewImg = document.getElementById(`${prefix}-target-preview`);
    const fileInput = document.getElementById(`${prefix}-target-file`);
    const previewContainer = document.getElementById(`${prefix}-target-preview-container`);
    const emptyHint = document.getElementById(`${prefix}-target-empty-hint`);
    
    // 清除预览
    if (previewImg) {
        previewImg.src = '';
    }
    
    // 重置文件输入
    if (fileInput) {
        fileInput.value = '';
    }
    
    // 显示空提示，隐藏预览
    if (emptyHint) emptyHint.style.display = 'block';
    if (previewContainer) previewContainer.style.display = 'none';
    
    updateBatchProcessButton(type);
}

function clearBatchImages(type) {
    const count = batchData[type].sourceImages.length;
    if (count === 0) return;
    
    batchData[type].sourceImages = [];
    displayBatchSourcePreviews(type, []);
    updateBatchProcessButton(type);
    showToast(`✓ 已清空全部 ${count} 张图片`, 'info', 1500);
}

// 下载批量结果为 ZIP
async function downloadBatchZip(type) {
    const data = batchData[type];
    const successResults = data.results.filter(r => r.success);
    
    if (successResults.length === 0) {
        showToast('没有可下载的图片', 'error');
        return;
    }
    
    const urls = successResults.map(r => r.url);
    
    try {
        showToast('正在打包下载...', 'info', 1500);
        
        const response = await fetch(API_BASE + '/download-batch-zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                urls: urls,
                name: `batch_${type}_${Date.now()}`
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch_${type}_results.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        showToast(`✓ 下载已开始（共 ${successResults.length} 张图片）`, 'success', 2000);
        
    } catch (error) {
        console.error('下载错误:', error);
        showToast(`✗ 下载失败：${error.message}`, 'error', 3000);
    }
}

// ==========================================
// 批量背景替换 - 双模式支持
// ==========================================

// 当前背景替换模式
let bgReplaceMode = 'multi'; // 'multi' 或 'single'

// 切换背景替换模式
function switchBgMode(mode) {
    bgReplaceMode = mode;
    
    const multiBtn = document.getElementById('multi-product-mode-btn');
    const singleBtn = document.getElementById('single-product-mode-btn');
    const sourceLabel = document.getElementById('batch-bg-source-label');
    const sourceHint = document.getElementById('batch-bg-source-hint');
    const sourceLimit = document.getElementById('batch-bg-source-limit');
    const sourceCount = document.getElementById('batch-bg-count');
    const targetHint = document.getElementById('batch-bg-target-hint');
    const targetLimit = document.getElementById('batch-bg-target-limit');
    const targetCount = document.getElementById('batch-bg-target-count');
    const sourceInput = document.getElementById('batch-bg-source-file');
    const targetInput = document.getElementById('batch-bg-target-file');
    
    // 清空数据
    batchData.background.sourceImages = [];
    batchData.background.targetImage = null;
    if (!batchData.background.targetImages) batchData.background.targetImages = [];
    batchData.background.targetImages = [];
    
    // 清空预览
    document.getElementById('batch-bg-source-previews').innerHTML = '';
    document.getElementById('batch-bg-source-previews').style.display = 'none';
    document.getElementById('batch-bg-empty-hint').style.display = 'flex';
    document.getElementById('batch-bg-target-preview-container').style.display = 'none';
    document.getElementById('batch-bg-target-empty-hint').style.display = 'flex';
    const targetPreviews = document.getElementById('batch-bg-target-previews');
    if (targetPreviews) targetPreviews.innerHTML = '';
    
    // 更新按钮样式
    if (multiBtn && singleBtn) {
        multiBtn.classList.remove('active');
        singleBtn.classList.remove('active');
        multiBtn.style.background = 'transparent';
        multiBtn.style.boxShadow = 'none';
        singleBtn.style.background = 'transparent';
        singleBtn.style.boxShadow = 'none';
        
        if (mode === 'multi') {
            multiBtn.classList.add('active');
            multiBtn.style.background = 'white';
            multiBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        } else {
            singleBtn.classList.add('active');
            singleBtn.style.background = 'white';
            singleBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        }
    }
    
    if (mode === 'multi') {
        // 多产品模式
        if (sourceLabel) sourceLabel.textContent = '原图';
        if (sourceHint) sourceHint.textContent = '点击左侧"原图"按钮上传图片';
        if (sourceLimit) sourceLimit.textContent = '最多8张，可多次添加';
        if (sourceCount) sourceCount.textContent = '0/8';
        if (targetCount) targetCount.textContent = '1张';
        if (targetHint) targetHint.textContent = '点击左侧"背景图"按钮上传';
        if (targetLimit) targetLimit.style.display = 'none';
        
        if (sourceInput) {
            sourceInput.removeAttribute('multiple');
            sourceInput.setAttribute('multiple', 'true');
        }
        if (targetInput) targetInput.removeAttribute('multiple');
    } else {
        // 单产品模式
        if (sourceLabel) sourceLabel.textContent = '产品图';
        if (sourceHint) sourceHint.textContent = '点击左侧"产品图"按钮上传图片';
        if (sourceLimit) sourceLimit.textContent = '单张产品图';
        if (sourceCount) sourceCount.textContent = '0/1';
        if (targetCount) targetCount.textContent = '0/8';
        if (targetHint) targetHint.textContent = '点击左侧"背景图"按钮上传背景图';
        if (targetLimit) {
            targetLimit.style.display = 'block';
            targetLimit.textContent = '最多8张，可多次添加';
        }
        
        if (sourceInput) sourceInput.removeAttribute('multiple');
        if (targetInput) targetInput.setAttribute('multiple', 'true');
    }
    
    updateBatchProcessButton('background');
    showToast(`已切换到${mode === 'multi' ? '多产品' : '单产品'}模式`, 'success', 1500);
}

// 保存原函数
const _origHandleBatchFolderUpload = handleBatchFolderUpload;
const _origHandleBatchTargetUpload = handleBatchTargetUpload;
const _origUpdateBatchProcessButton = updateBatchProcessButton;
const _origDisplayBatchSourcePreviews = displayBatchSourcePreviews;
const _origRemoveBatchImage = removeBatchImage;
const _origClearBatchTarget = clearBatchTarget;

// 重写handleBatchFolderUpload
handleBatchFolderUpload = function(type, input) {
    if (type === 'background' && bgReplaceMode === 'single') {
        const newFiles = Array.from(input.files).filter(f => f.type.startsWith('image/'));
        if (newFiles.length === 0) {
            showToast('请选择图片文件', 'error');
            return;
        }
        if (newFiles.length > 1) {
            showToast('单产品模式只能上传1张产品图', 'error');
            input.value = '';
            return;
        }
        if (batchData.background.sourceImages.length > 0) {
            showToast('单产品模式只能上传1张产品图，请先删除现有图片', 'error');
            input.value = '';
            return;
        }
        batchData.background.sourceImages = [newFiles[0]];
        displayBatchSourcePreviews(type, [newFiles[0]]);
        updateBatchProcessButton(type);
        input.value = '';
        showToast('✓ 已上传产品图', 'success', 1200);
        return;
    }
    return _origHandleBatchFolderUpload.call(this, type, input);
};

// 重写handleBatchTargetUpload
handleBatchTargetUpload = function(type, input) {
    if (type === 'background' && bgReplaceMode === 'single') {
        const files = Array.from(input.files).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) {
            showToast('请选择图片文件', 'error');
            return;
        }
        if (!batchData.background.targetImages) batchData.background.targetImages = [];
        const existingFiles = batchData.background.targetImages;
        const allFiles = [...existingFiles, ...files];
        if (allFiles.length > 8) {
            showToast(`最多只能上传8张背景图\n当前已有 ${existingFiles.length} 张，本次选择 ${files.length} 张，超出限制`, 'error', 3000);
            input.value = '';
            return;
        }
        batchData.background.targetImages = allFiles;
        displayBgMultiPreviews(allFiles);
        updateBatchProcessButton(type);
        input.value = '';
        showToast(`✓ 已添加 ${files.length} 张背景图，当前共 ${allFiles.length}/8 张`, 'success', 1200);
        return;
    }
    return _origHandleBatchTargetUpload.call(this, type, input);
};

// 显示多张背景图预览
function displayBgMultiPreviews(files) {
    const container = document.getElementById('batch-bg-target-preview-container');
    const emptyHint = document.getElementById('batch-bg-target-empty-hint');
    const multiWrapper = document.getElementById('batch-bg-target-previews');
    const singleWrapper = document.getElementById('batch-bg-single-wrapper');
    const countBadge = document.getElementById('batch-bg-target-count');
    
    if (!container || !multiWrapper) return;
    
    if (singleWrapper) singleWrapper.style.display = 'none';
    multiWrapper.style.display = 'grid';
    multiWrapper.innerHTML = '';
    
    files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.style.cssText = 'position: relative; border-radius: 8px; overflow: hidden;';
        
        const img = document.createElement('img');
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.readAsDataURL(file);
        
        const badge = document.createElement('span');
        badge.textContent = `背景${index + 1}`;
        badge.style.cssText = 'position: absolute; top: 4px; left: 4px; background: rgba(74, 144, 226, 0.9); color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; z-index: 1;';
        
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '×';
        removeBtn.className = 'preview-item-remove';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeBgImage(index);
        };
        
        item.appendChild(img);
        item.appendChild(badge);
        item.appendChild(removeBtn);
        multiWrapper.appendChild(item);
    });
    
    if (countBadge) countBadge.textContent = `${files.length}/8`;
    container.style.display = 'block';
    if (emptyHint) emptyHint.style.display = 'none';
}

// 删除单张背景图
function removeBgImage(index) {
    const files = batchData.background.targetImages;
    if (!files || index >= files.length) return;
    files.splice(index, 1);
    batchData.background.targetImages = files;
    if (files.length === 0) {
        document.getElementById('batch-bg-target-preview-container').style.display = 'none';
        document.getElementById('batch-bg-target-empty-hint').style.display = 'flex';
        document.getElementById('batch-bg-target-count').textContent = '0/8';
    } else {
        displayBgMultiPreviews(files);
    }
    updateBatchProcessButton('background');
    showToast(`✓ 已删除背景图，剩余 ${files.length}/8 张`, 'info', 1500);
}

// 重写updateBatchProcessButton
updateBatchProcessButton = function(type) {
    if (type === 'background' && bgReplaceMode === 'single') {
        const btn = document.getElementById('batch-bg-process-btn');
        const data = batchData.background;
        const hasProduct = data.sourceImages.length === 1;
        const hasBackgrounds = (data.targetImages && data.targetImages.length > 0);
        if (btn) btn.disabled = !(hasProduct && hasBackgrounds);
        return;
    }
    return _origUpdateBatchProcessButton.call(this, type);
};

// 重写displayBatchSourcePreviews
displayBatchSourcePreviews = function(type, files) {
    const result = _origDisplayBatchSourcePreviews.call(this, type, files);
    if (type === 'background' && bgReplaceMode === 'single') {
        const countBadge = document.getElementById('batch-bg-count');
        if (countBadge) countBadge.textContent = `${files.length}/1`;
    }
    return result;
};

// 重写removeBatchImage
removeBatchImage = function(type, index, event) {
    const result = _origRemoveBatchImage.call(this, type, index, event);
    if (type === 'background' && bgReplaceMode === 'single') {
        const files = batchData.background.sourceImages;
        showToast(`✓ 已删除图片，剩余 ${files.length}/1 张`, 'info', 1500);
    }
    return result;
};

// 重写clearBatchTarget
clearBatchTarget = function(type, event) {
    if (type === 'background' && bgReplaceMode === 'single') {
        if (event) event.stopPropagation();
        batchData.background.targetImages = [];
        document.getElementById('batch-bg-target-preview-container').style.display = 'none';
        document.getElementById('batch-bg-target-empty-hint').style.display = 'flex';
        document.getElementById('batch-bg-target-count').textContent = '0/8';
        updateBatchProcessButton(type);
        return;
    }
    return _origClearBatchTarget.call(this, type, event);
};

// 显示批量处理加载动画
function showBatchLoading(message = '正在替换，请耐心等待...') {
    // 移除已存在的加载动画
    const existingLoading = document.getElementById('batch-loading-overlay');
    if (existingLoading) {
        existingLoading.remove();
    }
    
    // 创建加载遮罩
    const overlay = document.createElement('div');
    overlay.id = 'batch-loading-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        backdrop-filter: blur(2px);
    `;
    
    // 创建加载内容
    const loadingContent = document.createElement('div');
    loadingContent.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 40px 50px;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        min-width: 280px;
    `;
    
    // 创建转圈动画
    const spinner = document.createElement('div');
    spinner.style.cssText = `
        width: 48px;
        height: 48px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #4a90e2;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 20px;
    `;
    
    // 添加 CSS 动画（如果还没有）
    if (!document.getElementById('batch-loading-style')) {
        const style = document.createElement('style');
        style.id = 'batch-loading-style';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // 创建提示文字
    const text = document.createElement('div');
    text.textContent = message;
    text.style.cssText = `
        color: #333;
        font-size: 16px;
        font-weight: 500;
        margin-top: 10px;
    `;
    
    loadingContent.appendChild(spinner);
    loadingContent.appendChild(text);
    overlay.appendChild(loadingContent);
    document.body.appendChild(overlay);
}

// 隐藏批量处理加载动画
function hideBatchLoading() {
    const loading = document.getElementById('batch-loading-overlay');
    if (loading) {
        loading.remove();
    }
}

// 处理单产品模式的批量背景替换
async function processBatchBackgroundSingle(data, prefix, progressBar, progressText, progressDiv, processBtn) {
    const productImage = data.sourceImages[0];
    const backgroundImages = data.targetImages || [];
    const totalBackgrounds = backgroundImages.length;
    
    if (!productImage || totalBackgrounds === 0) {
        showToast('请上传完整的图片', 'error');
        return;
    }
    
    // 隐藏进度条，显示居中加载动画
    if (progressDiv) progressDiv.style.display = 'none';
    showBatchLoading('正在替换，请耐心等待...');
    processBtn.disabled = true;
    
    const results = [];
    let succeeded = 0;
    let failed = 0;
    
    try {
        // 逐张处理每张背景图
        for (let i = 0; i < totalBackgrounds; i++) {
            const backgroundImage = backgroundImages[i];
            
            try {
                // 构建 FormData - 每次只处理一张背景图
                const formData = new FormData();
                formData.append('source_images', productImage); // 产品图
                formData.append('background_image', backgroundImage); // 当前背景图
                
                // 调用 API
                const response = await fetch(API_BASE + '/batch-replace-background', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const result = await response.json();
                
                if (result.success && result.results && result.results.length > 0) {
                    // 提取处理结果
                    const processedResult = result.results[0];
                    results.push({
                        success: true,
                        index: i,
                        url: processedResult.url,
                        filename: processedResult.filename || `result_${i + 1}.png`
                    });
                    succeeded++;
                } else {
                    throw new Error(result.error || '处理失败');
                }
            } catch (error) {
                console.error(`背景图 ${i + 1} 处理失败:`, error);
                results.push({
                    success: false,
                    index: i,
                    error: error.message || '处理失败'
                });
                failed++;
            }
        }
        
        // 隐藏加载动画
        hideBatchLoading();
        
        // 保存结果
        data.results = results;
        
        // 显示结果
        displayBatchResults('background', {
            success: true,
            succeeded: succeeded,
            failed: failed,
            results: results
        });
        
        showToast(
            `✓ 处理完成！成功：${succeeded}，失败：${failed}`,
            failed === 0 ? 'success' : 'warning',
            2500
        );
        
        processBtn.disabled = false;
        
    } catch (error) {
        console.error('批量处理失败:', error);
        hideBatchLoading();
        showToast(`✗ 处理失败：${error.message}`, 'error', 3000);
        processBtn.disabled = false;
    }
}
