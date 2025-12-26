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

// ==========================================
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
    
    // 创建新对话并跳转到对话页面（支持多张图片）
    startNewChatWithMessage(prompt, chatUploadedImages);
    
    // 清空输入
    input.value = '';
    input.style.height = 'auto';
    clearAllHomeImages();
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

function startNewChatWithMessage(prompt, images) {
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

async function sendToAI(prompt, images) {
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
        
        if (prompt) {
            formData.append('prompt', prompt);
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
        
        // 发送到 AI（多张图片）
        sendToAI(prompt, chatPageUploadedImages);
        clearAllChatPageImages();
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

// ==========================================
// 调试信息
// ==========================================
console.log('🎨 AI 图像处理助手已加载');
console.log('📡 API 地址:', API_BASE);

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
            
            // 更新进度条
            const current = progress.current || 0;
            const percentage = Math.min(20 + (current / total) * 70, 90); // 20%-90%
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `处理中... ${current}/${total}（成功：${progress.succeeded}，失败：${progress.failed}）`;
            
            // 检查是否完成
            if (progress.status === 'completed') {
                progressBar.style.width = '100%';
                progressText.textContent = `处理完成！`;
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

// 批量处理（逐张循环处理，实时进度）
async function processBatch(type) {
    const prefix = type === 'background' ? 'batch-bg' : 'batch-mg';
    const data = batchData[type];
    
    if (data.sourceImages.length === 0 || !data.targetImage) {
        showToast('请上传完整的图片', 'error');
        return;
    }
    
    // 显示进度
    const progressDiv = document.getElementById(`${prefix}-progress`);
    const progressBar = document.getElementById(`${prefix}-progress-bar`);
    const progressText = document.getElementById(`${prefix}-progress-text`);
    const processBtn = document.getElementById(`${prefix}-process-btn`);
    
    progressDiv.style.display = 'block';
    processBtn.disabled = true;
    progressBar.style.width = '0%';
    progressText.textContent = '准备处理...';
    
    try {
        // 构建 FormData
        const formData = new FormData();
        
        // 添加所有原图
        data.sourceImages.forEach((file, idx) => {
            formData.append('source_images', file);
        });
        
        // 添加目标图
        const targetKey = type === 'background' ? 'background_image' : 'target_image';
        formData.append(targetKey, data.targetImage);
        
        // 更新进度
        progressBar.style.width = '10%';
        progressText.textContent = `正在上传图片... 0/${data.sourceImages.length}`;
        
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
            progressBar.style.width = '100%';
            progressText.textContent = `处理完成！`;
            
            data.results = initialResult.results || [];
            displayBatchResults(type, initialResult);
            
            showToast(
                `✓ 处理完成！成功：${initialResult.succeeded}，失败：${initialResult.failed}`,
                initialResult.failed === 0 ? 'success' : 'warning',
                2500
            );
            
            // 隐藏进度
            setTimeout(() => {
                progressDiv.style.display = 'none';
            }, 1000);
            return;
        }
        
        // 如果后端返回了 task_id，说明是异步处理，需要轮询
        if (!taskId) {
            throw new Error(initialResult.error || '处理失败：未返回任务ID');
        }
        
        progressBar.style.width = '20%';
        progressText.textContent = `处理中... 0/${data.sourceImages.length}`;
        
        // 轮询进度
        const progressResult = await pollProgress(taskId, type, progressBar, progressText, data.sourceImages.length);
        
        // 轮询返回的进度对象需要转换为结果格式
        const result = {
            success: progressResult.status === 'completed',
            total: progressResult.total,
            succeeded: progressResult.succeeded,
            failed: progressResult.failed,
            results: progressResult.results || []
        };
        
        progressBar.style.width = '100%';
        
        if (result.success) {
            data.results = result.results || [];
            displayBatchResults(type, result);
            
            showToast(
                `✓ 处理完成！成功：${result.succeeded}，失败：${result.failed}`,
                result.failed === 0 ? 'success' : 'warning',
                2500
            );
            
            // 隐藏进度
            setTimeout(() => {
                progressDiv.style.display = 'none';
            }, 1000);
        } else {
            throw new Error(progressResult.error || '处理失败');
        }
        
    } catch (error) {
        console.error('批量处理错误:', error);
        showToast(`✗ 处理失败：${error.message}`, 'error', 3000);
        progressDiv.style.display = 'none';
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
