// 莫奈睡莲风格个人网站 JavaScript

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    // 初始化所有功能
    initNavigation();
    initScrollAnimations();
    initSkillBars();
    initContactForm();
    // initPortraitUpload(); // 已移除上传功能
});


// 导航栏功能
function initNavigation() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    // 汉堡菜单切换
    if (hamburger) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
    }

    // 导航链接点击
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // 移除移动端菜单
            if (navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
                hamburger.classList.remove('active');
            }

            // 平滑滚动
            const targetId = this.getAttribute('href');
            if (targetId.startsWith('#')) {
                e.preventDefault();
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    const offsetTop = targetElement.offsetTop - 70; // 导航栏高度
                    window.scrollTo({
                        top: offsetTop,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // 导航栏滚动效果
    let lastScrollTop = 0;
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // 导航栏背景透明度
        if (scrollTop > 50) {
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.backdropFilter = 'blur(25px)';
        } else {
            navbar.style.background = 'rgba(255, 255, 255, 0.9)';
            navbar.style.backdropFilter = 'blur(20px)';
        }

        // 活跃链接高亮
        updateActiveNavLink();
        
        lastScrollTop = scrollTop;
    });
}

// 更新活跃导航链接
function updateActiveNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    
    let current = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        const sectionHeight = section.clientHeight;
        
        if (window.pageYOffset >= sectionTop && 
            window.pageYOffset < sectionTop + sectionHeight) {
            current = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
}

// 滚动动画
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
                
                // 特殊处理技能条动画
                if (entry.target.classList.contains('skill-category')) {
                    animateSkillBars(entry.target);
                }
            }
        });
    }, observerOptions);

    // 观察需要动画的元素
    const animateElements = document.querySelectorAll(
        '.about-card, .project-card, .skill-category, .contact-card, .section-header'
    );
    
    animateElements.forEach(el => {
        el.classList.add('loading');
        observer.observe(el);
    });
}

// 技能条动画
function initSkillBars() {
    // 这个函数在滚动动画中被调用
}

function animateSkillBars(skillCategory) {
    const skillBars = skillCategory.querySelectorAll('.skill-progress');
    
    skillBars.forEach((bar, index) => {
        const targetWidth = bar.style.width;
        bar.style.width = '0%';
        
        setTimeout(() => {
            bar.style.width = targetWidth;
        }, index * 200);
    });
}

// 联系表单处理
function initContactForm() {
    const contactForm = document.querySelector('.contact-form form');
    
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // 获取表单数据
            const formData = new FormData(this);
            const name = this.querySelector('input[type="text"]').value;
            const email = this.querySelector('input[type="email"]').value;
            const message = this.querySelector('textarea').value;
            
            // 简单验证
            if (!name || !email || !message) {
                showNotification('请填写所有必填字段', 'error');
                return;
            }
            
            if (!isValidEmail(email)) {
                showNotification('请输入有效的邮箱地址', 'error');
                return;
            }
            
            // 保存留言到本地存储
            saveMessage(name, email, message);
            
            showNotification('消息发送成功！我会尽快回复您', 'success');
            this.reset();
        });
    }
}

// 邮箱验证
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// 通知显示
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // 样式
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '1rem 1.5rem',
        borderRadius: '8px',
        color: 'white',
        fontWeight: '500',
        zIndex: '10000',
        transform: 'translateX(400px)',
        transition: 'transform 0.3s ease',
        maxWidth: '300px',
        wordWrap: 'break-word'
    });
    
    // 根据类型设置背景色
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #4B8B3B, #B0E57C)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #F28D8D, #FFB4A2)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #3A6B8C, #A9D0F5)';
    }
    
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // 自动隐藏
    setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// 平滑滚动到顶部
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// 添加回到顶部按钮
function addScrollToTopButton() {
    const scrollButton = document.createElement('button');
    scrollButton.innerHTML = '↑';
    scrollButton.className = 'scroll-to-top';
    
    Object.assign(scrollButton.style, {
        position: 'fixed',
        bottom: '30px',
        right: '30px',
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        border: 'none',
        background: 'linear-gradient(135deg, #3A6B8C, #4B8B3B)',
        color: 'white',
        fontSize: '20px',
        cursor: 'pointer',
        zIndex: '1000',
        opacity: '0',
        transform: 'translateY(100px)',
        transition: 'all 0.3s ease',
        boxShadow: '0 4px 20px rgba(42, 77, 105, 0.3)'
    });
    
    scrollButton.addEventListener('click', scrollToTop);
    
    // 滚动显示/隐藏
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            scrollButton.style.opacity = '1';
            scrollButton.style.transform = 'translateY(0)';
        } else {
            scrollButton.style.opacity = '0';
            scrollButton.style.transform = 'translateY(100px)';
        }
    });
    
    scrollButton.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(0) scale(1.1)';
    });
    
    scrollButton.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) scale(1)';
    });
    
    document.body.appendChild(scrollButton);
}

// 打字机效果
function typewriterEffect(element, text, speed = 100) {
    if (!element) return;
    
    element.textContent = '';
    let i = 0;
    
    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    
    type();
}

// 页面加载完成后的初始化
window.addEventListener('load', function() {
    // 添加回到顶部按钮
    addScrollToTopButton();
    
    // 为hero标题添加打字机效果
    const heroTitle = document.querySelector('.hero-title .gradient-text');
    if (heroTitle) {
        const originalText = heroTitle.textContent;
        setTimeout(() => {
            typewriterEffect(heroTitle, originalText, 150);
        }, 1000);
    }
    
    // 移除加载状态
    document.body.classList.add('loaded');
});

// 鼠标跟踪效果（可选）
function initMouseTracker() {
    let mouseX = 0;
    let mouseY = 0;
    
    document.addEventListener('mousemove', function(e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    
    // 为某些元素添加鼠标跟踪效果
    const trackElements = document.querySelectorAll('.about-card, .project-card');
    
    trackElements.forEach(element => {
        element.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px) rotateX(5deg) rotateY(5deg)';
            this.style.transition = 'transform 0.3s ease';
        });
        
        element.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) rotateX(0) rotateY(0)';
        });
        
        element.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / centerY * 10;
            const rotateY = (x - centerX) / centerX * 10;
            
            this.style.transform = `translateY(-5px) rotateX(${-rotateX}deg) rotateY(${rotateY}deg)`;
        });
    });
}

// 性能优化：节流函数
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// 防抖函数
function debounce(func, wait, immediate) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}


// 添加一些额外的交互效果
document.addEventListener('DOMContentLoaded', function() {
    // 初始化鼠标跟踪（如果需要）
    // initMouseTracker();
    
    // 为按钮添加涟漪效果
    addRippleEffect();
});

function addRippleEffect() {
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple');
            
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
}

// 添加涟漪效果的CSS（通过JavaScript动态添加）
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
.btn {
    position: relative;
    overflow: hidden;
}

.ripple {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: scale(0);
    animation: ripple-animation 0.6s linear;
    pointer-events: none;
}

@keyframes ripple-animation {
    to {
        transform: scale(4);
        opacity: 0;
    }
}
`;

document.head.appendChild(rippleStyle);

// 头像上传功能
function initPortraitUpload() {
    const portraitFrame = document.querySelector('.portrait-frame');
    const portraitUpload = document.getElementById('portraitUpload');
    const portraitImage = document.getElementById('portraitImage');
    const portraitPlaceholder = document.querySelector('.portrait-placeholder');
    
    if (!portraitFrame || !portraitUpload || !portraitImage || !portraitPlaceholder) {
        return;
    }
    
    // 点击头像框触发文件选择
    portraitFrame.addEventListener('click', function() {
        portraitUpload.click();
    });
    
    // 处理文件选择
    portraitUpload.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            // 检查文件大小（限制为5MB）
            if (file.size > 5 * 1024 * 1024) {
                showNotification('图片文件大小不能超过5MB', 'error');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                portraitImage.src = e.target.result;
                portraitImage.classList.add('loaded');
                portraitPlaceholder.classList.add('hidden');
                
                // 保存到localStorage
                localStorage.setItem('userPortrait', e.target.result);
                
                showNotification('头像上传成功！', 'success');
            };
            reader.readAsDataURL(file);
        } else {
            showNotification('请选择有效的图片文件', 'error');
        }
    });
    
    // 加载已保存的头像
    loadSavedPortrait();
    
    // 添加拖拽上传功能
    initDragAndDrop();
}

// 加载已保存的头像
function loadSavedPortrait() {
    const savedPortrait = localStorage.getItem('userPortrait');
    const portraitImage = document.getElementById('portraitImage');
    const portraitPlaceholder = document.querySelector('.portrait-placeholder');
    
    if (savedPortrait && portraitImage && portraitPlaceholder) {
        portraitImage.src = savedPortrait;
        portraitImage.classList.add('loaded');
        portraitPlaceholder.classList.add('hidden');
    }
}

// 拖拽上传功能
function initDragAndDrop() {
    const portraitFrame = document.querySelector('.portrait-frame');
    
    if (!portraitFrame) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        portraitFrame.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        portraitFrame.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        portraitFrame.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        portraitFrame.style.transform = 'scale(1.05)';
        portraitFrame.style.boxShadow = 'var(--shadow-strong), 0 0 30px rgba(169, 208, 245, 0.5)';
    }
    
    function unhighlight() {
        portraitFrame.style.transform = '';
        portraitFrame.style.boxShadow = '';
    }
    
    portraitFrame.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                // 模拟文件输入
                const portraitUpload = document.getElementById('portraitUpload');
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                portraitUpload.files = dataTransfer.files;
                
                // 触发change事件
                const event = new Event('change', { bubbles: true });
                portraitUpload.dispatchEvent(event);
            } else {
                showNotification('请拖拽图片文件', 'error');
            }
        }
    }
}

// 重置头像功能（可选）
function resetPortrait() {
    const portraitImage = document.getElementById('portraitImage');
    const portraitPlaceholder = document.querySelector('.portrait-placeholder');
    const portraitUpload = document.getElementById('portraitUpload');
    
    if (portraitImage && portraitPlaceholder && portraitUpload) {
        portraitImage.classList.remove('loaded');
        portraitPlaceholder.classList.remove('hidden');
        portraitUpload.value = '';
        localStorage.removeItem('userPortrait');
        showNotification('头像已重置', 'info');
    }
}

// 添加右键菜单功能（可选）
function addPortraitContextMenu() {
    const portraitFrame = document.querySelector('.portrait-frame');
    
    if (!portraitFrame) return;
    
    portraitFrame.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        
        const portraitImage = document.getElementById('portraitImage');
        if (portraitImage.classList.contains('loaded')) {
            const confirmReset = confirm('是否要重置头像？');
            if (confirmReset) {
                resetPortrait();
            }
        }
    });
}

// 留言管理功能
function saveMessage(name, email, message) {
    const messages = getMessages();
    const newMessage = {
        id: Date.now(),
        name: name,
        email: email,
        message: message,
        timestamp: new Date().toISOString(),
        read: false
    };
    
    messages.push(newMessage);
    localStorage.setItem('websiteMessages', JSON.stringify(messages));
}

function getMessages() {
    const messages = localStorage.getItem('websiteMessages');
    return messages ? JSON.parse(messages) : [];
}

function deleteMessage(messageId) {
    const messages = getMessages();
    const filteredMessages = messages.filter(msg => msg.id !== messageId);
    localStorage.setItem('websiteMessages', JSON.stringify(filteredMessages));
}

function markMessageAsRead(messageId) {
    const messages = getMessages();
    const message = messages.find(msg => msg.id === messageId);
    if (message) {
        message.read = true;
        localStorage.setItem('websiteMessages', JSON.stringify(messages));
    }
}

// 管理员面板功能
function showAdminPanel() {
    // 简单的密码验证
    const password = prompt('请输入管理员密码：');
    if (password !== 'tracy2025') {
        showNotification('密码错误！', 'error');
        return;
    }
    
    const messages = getMessages();
    
    if (messages.length === 0) {
        showNotification('暂无留言', 'info');
        return;
    }
    
    // 创建管理面板
    const adminPanel = createAdminPanel(messages);
    document.body.appendChild(adminPanel);
}

function createAdminPanel(messages) {
    const panel = document.createElement('div');
    panel.className = 'admin-panel';
    panel.innerHTML = `
        <div class="admin-content">
            <div class="admin-header">
                <h2>留言管理</h2>
                <button class="close-admin" onclick="closeAdminPanel()">×</button>
            </div>
            <div class="admin-body">
                ${messages.map(msg => `
                    <div class="message-item ${msg.read ? 'read' : 'unread'}" data-id="${msg.id}">
                        <div class="message-header">
                            <strong>${msg.name}</strong>
                            <span class="message-email">${msg.email}</span>
                            <span class="message-time">${formatDate(msg.timestamp)}</span>
                        </div>
                        <div class="message-content">${msg.message}</div>
                        <div class="message-actions">
                            ${!msg.read ? `<button onclick="markAsRead(${msg.id})">标为已读</button>` : ''}
                            <button onclick="deleteMsg(${msg.id})">删除</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .admin-panel {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .admin-content {
            background: white;
            border-radius: 12px;
            width: 90%;
            max-width: 800px;
            max-height: 80%;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .admin-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem;
            background: linear-gradient(135deg, #3A6B8C, #4B8B3B);
            color: white;
        }
        
        .admin-header h2 {
            margin: 0;
        }
        
        .close-admin {
            background: none;
            border: none;
            color: white;
            font-size: 2rem;
            cursor: pointer;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .close-admin:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        
        .admin-body {
            padding: 1.5rem;
            max-height: 500px;
            overflow-y: auto;
        }
        
        .message-item {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1rem;
            background: #f9f9f9;
        }
        
        .message-item.unread {
            background: #fff3cd;
            border-color: #ffc107;
        }
        
        .message-header {
            display: flex;
            gap: 1rem;
            margin-bottom: 0.5rem;
            flex-wrap: wrap;
        }
        
        .message-email {
            color: #666;
        }
        
        .message-time {
            color: #999;
            font-size: 0.9rem;
        }
        
        .message-content {
            margin: 1rem 0;
            line-height: 1.5;
        }
        
        .message-actions {
            display: flex;
            gap: 0.5rem;
        }
        
        .message-actions button {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9rem;
        }
        
        .message-actions button:first-child {
            background: #28a745;
            color: white;
        }
        
        .message-actions button:last-child {
            background: #dc3545;
            color: white;
        }
    `;
    
    if (!document.querySelector('.admin-panel-style')) {
        style.className = 'admin-panel-style';
        document.head.appendChild(style);
    }
    
    return panel;
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN');
}

function closeAdminPanel() {
    const panel = document.querySelector('.admin-panel');
    if (panel) {
        panel.remove();
    }
}

function markAsRead(messageId) {
    markMessageAsRead(messageId);
    const messageItem = document.querySelector(`[data-id="${messageId}"]`);
    if (messageItem) {
        messageItem.classList.remove('unread');
        messageItem.classList.add('read');
        const markButton = messageItem.querySelector('.message-actions button:first-child');
        if (markButton && markButton.textContent === '标为已读') {
            markButton.remove();
        }
    }
    showNotification('已标记为已读', 'success');
}

function deleteMsg(messageId) {
    if (confirm('确定要删除这条留言吗？')) {
        deleteMessage(messageId);
        const messageItem = document.querySelector(`[data-id="${messageId}"]`);
        if (messageItem) {
            messageItem.remove();
        }
        showNotification('留言已删除', 'success');
    }
}

// 添加管理员入口（键盘快捷键）
document.addEventListener('keydown', function(e) {
    // 按下 Ctrl + Shift + A 打开管理面板
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        showAdminPanel();
    }
});

// ==================== 睡莲跑酷游戏 ====================

class WaterLilyRunner {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.gameState = 'waiting'; // waiting, playing, paused, gameOver
        this.score = 0;
        this.highScore = 0;
        this.gameSpeed = 2;
        this.frame = 0;
        
        // 游戏元素
        this.player = {
            x: 80,
            y: 280,
            width: 40,
            height: 40,
            velocityY: 0,
            jumping: false,
            grounded: false,
            color: '#4B8B3B' // 使用主题绿色
        };
        
        this.obstacles = [];
        this.collectibles = [];
        this.particles = [];
        this.ground = 320;
        
        // 游戏设置
        this.gravity = 0.6;
        this.jumpPower = -12;
        this.obstacleSpawnRate = 0.008;
        this.collectibleSpawnRate = 0.005;
        
        // 颜色主题
        this.colors = {
            primary: '#3A6B8C',
            secondary: '#4B8B3B',
            accent: '#A9D0F5',
            collectible: '#FFD700',
            obstacle: '#2A4D69',
            particle: '#B0E57C'
        };
        
        this.init();
    }
    
    init() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        
        // 加载最高分
        this.highScore = parseInt(localStorage.getItem('waterLilyRunnerHighScore') || '0');
        this.updateScoreDisplay();
        
        // 绑定事件
        this.bindEvents();
        
        // 开始渲染循环
        this.render();
    }
    
    bindEvents() {
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startGame());
        }
        
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.togglePause());
        }
        
        // 键盘控制
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.handleJump();
            }
            if (e.key === 'p' || e.key === 'P') {
                this.togglePause();
            }
        });
        
        // 触摸控制
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleJump();
        });
        
        // 鼠标控制
        this.canvas.addEventListener('click', (e) => {
            this.handleJump();
        });
    }
    
    handleJump() {
        if (this.gameState === 'waiting') {
            this.startGame();
            return;
        }
        
        if (this.gameState === 'playing' && this.player.grounded) {
            this.player.velocityY = this.jumpPower;
            this.player.jumping = true;
            this.player.grounded = false;
            
            // 添加跳跃粒子效果
            this.addJumpParticles();
        }
        
        if (this.gameState === 'gameOver') {
            this.resetGame();
        }
    }
    
    startGame() {
        this.gameState = 'playing';
        this.score = 0;
        this.gameSpeed = 2;
        this.frame = 0;
        this.obstacles = [];
        this.collectibles = [];
        this.particles = [];
        
        // 重置玩家位置
        this.player.y = 280;
        this.player.velocityY = 0;
        this.player.jumping = false;
        this.player.grounded = true;
        
        this.updateUI();
        this.updateScoreDisplay();
    }
    
    togglePause() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
            document.body.classList.add('game-paused');
        } else if (this.gameState === 'paused') {
            this.gameState = 'playing';
            document.body.classList.remove('game-paused');
        }
        this.updateUI();
    }
    
    resetGame() {
        this.gameState = 'waiting';
        document.body.classList.remove('game-over', 'game-paused');
        this.updateUI();
    }
    
    update() {
        if (this.gameState !== 'playing') return;
        
        this.frame++;
        
        // 更新玩家
        this.updatePlayer();
        
        // 生成障碍物
        if (Math.random() < this.obstacleSpawnRate + this.score * 0.00001) {
            this.spawnObstacle();
        }
        
        // 生成收集品
        if (Math.random() < this.collectibleSpawnRate) {
            this.spawnCollectible();
        }
        
        // 更新障碍物
        this.updateObstacles();
        
        // 更新收集品
        this.updateCollectibles();
        
        // 更新粒子
        this.updateParticles();
        
        // 检查碰撞
        this.checkCollisions();
        
        // 增加分数
        this.score += 0.1;
        this.updateScoreDisplay();
        
        // 增加游戏速度
        if (this.frame % 600 === 0) {
            this.gameSpeed += 0.2;
        }
    }
    
    updatePlayer() {
        // 应用重力
        this.player.velocityY += this.gravity;
        this.player.y += this.player.velocityY;
        
        // 地面碰撞
        if (this.player.y >= this.ground - this.player.height) {
            this.player.y = this.ground - this.player.height;
            this.player.velocityY = 0;
            this.player.jumping = false;
            this.player.grounded = true;
        } else {
            this.player.grounded = false;
        }
    }
    
    spawnObstacle() {
        const height = 30 + Math.random() * 40;
        this.obstacles.push({
            x: this.canvas.width,
            y: this.ground - height,
            width: 25,
            height: height,
            color: this.colors.obstacle
        });
    }
    
    spawnCollectible() {
        this.collectibles.push({
            x: this.canvas.width,
            y: 200 + Math.random() * 80,
            width: 20,
            height: 20,
            color: this.colors.collectible,
            collected: false,
            rotation: 0
        });
    }
    
    updateObstacles() {
        this.obstacles = this.obstacles.filter(obstacle => {
            obstacle.x -= this.gameSpeed;
            return obstacle.x + obstacle.width > 0;
        });
    }
    
    updateCollectibles() {
        this.collectibles = this.collectibles.filter(collectible => {
            collectible.x -= this.gameSpeed;
            collectible.rotation += 0.1;
            return collectible.x + collectible.width > 0 && !collectible.collected;
        });
    }
    
    updateParticles() {
        this.particles = this.particles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // 根据粒子类型应用不同的物理效果
            if (particle.type === 'water') {
                particle.vy += 0.15; // 水滴重力稍强
                particle.vx *= 0.98; // 空气阻力
            } else if (particle.type === 'sparkle') {
                particle.vy += 0.05; // 星光重力较弱
                particle.vx *= 0.95;
            } else if (particle.type === 'petal') {
                particle.vy += 0.08; // 花瓣缓慢下落
                particle.vx *= 0.96;
                particle.rotation += particle.rotationSpeed; // 旋转
                // 花瓣飘动效果
                particle.vx += Math.sin(particle.life * 0.1) * 0.1;
            } else {
                particle.vy += 0.1; // 默认重力
            }
            
            particle.life--;
            particle.alpha = Math.max(0, particle.life / particle.maxLife);
            
            return particle.life > 0;
        });
    }
    
    checkCollisions() {
        const playerRect = {
            x: this.player.x,
            y: this.player.y,
            width: this.player.width,
            height: this.player.height
        };
        
        // 检查障碍物碰撞
        for (let obstacle of this.obstacles) {
            if (this.isColliding(playerRect, obstacle)) {
                this.gameOver();
                return;
            }
        }
        
        // 检查收集品碰撞
        for (let collectible of this.collectibles) {
            if (!collectible.collected && this.isColliding(playerRect, collectible)) {
                collectible.collected = true;
                this.score += 10;
                this.addCollectParticles(collectible.x, collectible.y);
            }
        }
    }
    
    isColliding(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    gameOver() {
        this.gameState = 'gameOver';
        document.body.classList.add('game-over');
        
        // 更新最高分
        if (Math.floor(this.score) > this.highScore) {
            this.highScore = Math.floor(this.score);
            localStorage.setItem('waterLilyRunnerHighScore', this.highScore.toString());
            this.showNotification('🎉 新纪录！得分: ' + this.highScore, 'success');
        }
        
        this.updateUI();
        this.updateScoreDisplay();
    }
    
    addJumpParticles() {
        // 水花飞溅效果
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: this.player.x + this.player.width / 2 + (Math.random() - 0.5) * 20,
                y: this.player.y + this.player.height,
                vx: (Math.random() - 0.5) * 6,
                vy: Math.random() * -3 - 2,
                life: 40,
                maxLife: 40,
                alpha: 1,
                color: 'rgba(173, 216, 230, 1)',
                size: 2 + Math.random() * 3,
                type: 'water'
            });
        }
        
        // 魔法光芒效果
        for (let i = 0; i < 5; i++) {
            this.particles.push({
                x: this.player.x + this.player.width / 2,
                y: this.player.y + this.player.height / 2,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 35,
                maxLife: 35,
                alpha: 1,
                color: 'rgba(176, 229, 124, 1)',
                size: 2 + Math.random() * 2,
                type: 'sparkle'
            });
        }
    }
    
    addCollectParticles(x, y) {
        // 花瓣飞舞效果
        for (let i = 0; i < 12; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 10,
                y: y + (Math.random() - 0.5) * 10,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 60,
                maxLife: 60,
                alpha: 1,
                color: ['rgba(255, 192, 203, 1)', 'rgba(255, 182, 193, 1)', 'rgba(255, 218, 185, 1)'][Math.floor(Math.random() * 3)],
                size: 3 + Math.random() * 4,
                type: 'petal',
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.2
            });
        }
        
        // 金色星光效果
        for (let i = 0; i < 6; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 5,
                vy: (Math.random() - 0.5) * 5,
                life: 50,
                maxLife: 50,
                alpha: 1,
                color: 'rgba(255, 215, 0, 1)',
                size: 2 + Math.random() * 2,
                type: 'sparkle'
            });
        }
    }
    
    render() {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制背景
        this.drawBackground();
        
        // 绘制地面
        this.drawGround();
        
        // 绘制游戏元素
        this.drawObstacles();
        this.drawCollectibles();
        this.drawParticles();
        this.drawPlayer();
        
        // 绘制UI
        this.drawGameUI();
        
        // 更新游戏逻辑
        this.update();
        
        // 继续渲染循环
        requestAnimationFrame(() => this.render());
    }
    
    drawBackground() {
        // 绘制莫奈风格的天空渐变
        const skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height * 0.6);
        skyGradient.addColorStop(0, '#E8F4FD');  // 淡蓝天空
        skyGradient.addColorStop(0.3, '#D1E9F6'); // 中蓝
        skyGradient.addColorStop(0.7, '#B8DDF0'); // 深蓝
        skyGradient.addColorStop(1, '#A5D0E8');   // 接近水面的蓝
        
        this.ctx.fillStyle = skyGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height * 0.6);
        
        // 绘制远山轮廓
        this.drawMountains();
        
        // 绘制云朵效果
        this.drawClouds();
        
        // 绘制阳光效果
        this.drawSunlight();
    }
    
    drawMountains() {
        // 绘制远山轮廓（莫奈风格）
        this.ctx.fillStyle = 'rgba(120, 160, 180, 0.4)';
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.canvas.height * 0.5);
        this.ctx.lineTo(this.canvas.width * 0.3, this.canvas.height * 0.45);
        this.ctx.lineTo(this.canvas.width * 0.6, this.canvas.height * 0.48);
        this.ctx.lineTo(this.canvas.width, this.canvas.height * 0.52);
        this.ctx.lineTo(this.canvas.width, this.canvas.height * 0.6);
        this.ctx.lineTo(0, this.canvas.height * 0.6);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    drawClouds() {
        const cloudOffset1 = (this.frame * 0.15) % (this.canvas.width + 150);
        const cloudOffset2 = (this.frame * 0.08) % (this.canvas.width + 200);
        
        // 柔和的白云
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        
        // 云朵1 - 更大更柔和
        this.ctx.beginPath();
        this.ctx.arc(cloudOffset1 - 60, 50, 25, 0, Math.PI * 2);
        this.ctx.arc(cloudOffset1 - 30, 40, 35, 0, Math.PI * 2);
        this.ctx.arc(cloudOffset1, 45, 30, 0, Math.PI * 2);
        this.ctx.arc(cloudOffset1 + 25, 50, 20, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 云朵2 - 较小的云
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.beginPath();
        this.ctx.arc(cloudOffset2 + 100, 70, 18, 0, Math.PI * 2);
        this.ctx.arc(cloudOffset2 + 125, 65, 25, 0, Math.PI * 2);
        this.ctx.arc(cloudOffset2 + 150, 70, 20, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    drawSunlight() {
        // 绘制阳光效果
        const sunX = this.canvas.width * 0.8;
        const sunY = 40;
        
        // 太阳光晕
        const sunGradient = this.ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 80);
        sunGradient.addColorStop(0, 'rgba(255, 248, 220, 0.3)');
        sunGradient.addColorStop(0.5, 'rgba(255, 248, 220, 0.15)');
        sunGradient.addColorStop(1, 'rgba(255, 248, 220, 0)');
        
        this.ctx.fillStyle = sunGradient;
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, 80, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 太阳本体
        this.ctx.fillStyle = 'rgba(255, 248, 220, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, 15, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    drawGround() {
        // 绘制美丽的睡莲池塘
        const waterGradient = this.ctx.createLinearGradient(0, this.ground, 0, this.canvas.height);
        waterGradient.addColorStop(0, '#7FB3D3');  // 浅蓝水面
        waterGradient.addColorStop(0.3, '#5FA0C7'); // 中蓝
        waterGradient.addColorStop(0.7, '#4A8DB8'); // 深蓝
        waterGradient.addColorStop(1, '#3A7BA9');   // 池底深蓝
        
        this.ctx.fillStyle = waterGradient;
        this.ctx.fillRect(0, this.ground, this.canvas.width, this.canvas.height - this.ground);
        
        // 绘制水面倒影
        this.drawWaterReflections();
        
        // 绘制睡莲叶片
        this.drawLilyPads();
        
        // 绘制柔和的水波纹
        this.drawWaterRipples();
    }
    
    drawWaterReflections() {
        // 天空和云朵的倒影
        this.ctx.save();
        this.ctx.globalAlpha = 0.3;
        this.ctx.scale(1, -0.5);
        this.ctx.translate(0, -this.canvas.height);
        
        // 重新绘制简化的天空倒影
        const reflectionGradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height * 0.6);
        reflectionGradient.addColorStop(0, 'rgba(232, 244, 253, 0.5)');
        reflectionGradient.addColorStop(1, 'rgba(165, 208, 232, 0.3)');
        
        this.ctx.fillStyle = reflectionGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height * 0.6);
        
        this.ctx.restore();
    }
    
    drawLilyPads() {
        // 绘制漂浮的睡莲叶片作为装饰
        const pads = [
            { x: 150, y: this.ground + 15, size: 25, rotation: 0.2 },
            { x: 350, y: this.ground + 20, size: 30, rotation: -0.3 },
            { x: 550, y: this.ground + 18, size: 28, rotation: 0.1 },
            { x: 700, y: this.ground + 25, size: 22, rotation: -0.2 }
        ];
        
        pads.forEach(pad => {
            this.ctx.save();
            this.ctx.translate(pad.x, pad.y);
            this.ctx.rotate(pad.rotation);
            
            // 睡莲叶片
            this.ctx.fillStyle = 'rgba(76, 139, 59, 0.8)';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, pad.size, pad.size * 0.8, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 叶片纹理
            this.ctx.strokeStyle = 'rgba(60, 100, 45, 0.6)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(-pad.size * 0.7, 0);
            this.ctx.lineTo(pad.size * 0.7, 0);
            this.ctx.moveTo(0, -pad.size * 0.6);
            this.ctx.lineTo(0, pad.size * 0.6);
            this.ctx.stroke();
            
            this.ctx.restore();
        });
    }
    
    drawWaterRipples() {
        // 绘制更自然的水波纹
        for (let i = 0; i < 4; i++) {
            this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 - i * 0.03})`;
            this.ctx.lineWidth = 1.5 - i * 0.2;
            this.ctx.beginPath();
            
            const waveOffset = (this.frame * (0.3 + i * 0.1)) % (this.canvas.width + 60);
            
            for (let x = -60; x < this.canvas.width + 60; x += 15) {
                const baseY = this.ground + 8 + i * 3;
                const amplitude = (4 - i) * 0.8;
                const frequency = 0.015 + i * 0.005;
                const y = baseY + Math.sin((x + waveOffset) * frequency) * amplitude;
                
                if (x === -60) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.stroke();
        }
    }
    
    drawPlayer() {
        this.ctx.save();
        
        const centerX = this.player.x + this.player.width / 2;
        const centerY = this.player.y + this.player.height / 2;
        
        // 玩家水面倒影
        if (this.player.grounded) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.2;
            this.ctx.scale(1, -0.3);
            this.ctx.translate(0, -this.ground * 2 + 20);
            this.drawPlayerBody(centerX, centerY);
            this.ctx.restore();
        }
        
        // 玩家主体
        this.drawPlayerBody(centerX, centerY);
        
        // 跳跃时的光晕效果
        if (this.player.jumping) {
            const glowGradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 30);
            glowGradient.addColorStop(0, 'rgba(176, 229, 124, 0.3)');
            glowGradient.addColorStop(1, 'rgba(176, 229, 124, 0)');
            
            this.ctx.fillStyle = glowGradient;
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }
    
    drawPlayerBody(centerX, centerY) {
        // 睡莲精灵的身体 - 花朵形状
        const petalCount = 8;
        const innerRadius = 12;
        const outerRadius = 18;
        
        // 花瓣
        for (let i = 0; i < petalCount; i++) {
            const angle = (i * Math.PI * 2) / petalCount + this.frame * 0.02;
            const petalX = centerX + Math.cos(angle) * (innerRadius + 3);
            const petalY = centerY + Math.sin(angle) * (innerRadius + 3);
            
            // 花瓣渐变
            const petalGradient = this.ctx.createRadialGradient(petalX, petalY, 0, petalX, petalY, 8);
            petalGradient.addColorStop(0, '#E8F5E8');
            petalGradient.addColorStop(0.5, '#B0E57C');
            petalGradient.addColorStop(1, '#4B8B3B');
            
            this.ctx.fillStyle = petalGradient;
            this.ctx.beginPath();
            this.ctx.ellipse(petalX, petalY, 8, 4, angle, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // 花心 - 玩家的核心
        const coreGradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, innerRadius);
        coreGradient.addColorStop(0, '#FFE4B5');
        coreGradient.addColorStop(0.6, '#FFC107');
        coreGradient.addColorStop(1, '#FF8F00');
        
        this.ctx.fillStyle = coreGradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 可爱的眼睛
        this.ctx.fillStyle = '#2A4D69';
        this.ctx.beginPath();
        this.ctx.arc(centerX - 5, centerY - 3, 3, 0, Math.PI * 2);
        this.ctx.arc(centerX + 5, centerY - 3, 3, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 眼睛高光
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.arc(centerX - 4, centerY - 4, 1, 0, Math.PI * 2);
        this.ctx.arc(centerX + 6, centerY - 4, 1, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 微笑
        this.ctx.strokeStyle = '#2A4D69';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY + 2, 4, 0, Math.PI);
        this.ctx.stroke();
    }
    
    drawObstacles() {
        this.obstacles.forEach(obstacle => {
            const centerX = obstacle.x + obstacle.width / 2;
            const bottomY = obstacle.y + obstacle.height;
            
            // 障碍物阴影
            this.ctx.fillStyle = 'rgba(42, 77, 105, 0.2)';
            this.ctx.beginPath();
            this.ctx.ellipse(centerX, bottomY + 2, obstacle.width * 0.6, 4, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制芦苇或水草样式的障碍物
            this.drawReedObstacle(obstacle);
        });
    }
    
    drawReedObstacle(obstacle) {
        const segments = Math.floor(obstacle.height / 8);
        const baseWidth = obstacle.width;
        
        for (let i = 0; i < segments; i++) {
            const segmentY = obstacle.y + obstacle.height - (i + 1) * 8;
            const segmentWidth = baseWidth * (1 - i * 0.1); // 向上逐渐变细
            const segmentX = obstacle.x + (baseWidth - segmentWidth) / 2;
            
            // 芦苇段的渐变色
            const reedGradient = this.ctx.createLinearGradient(segmentX, segmentY, segmentX + segmentWidth, segmentY);
            reedGradient.addColorStop(0, '#2D5016');
            reedGradient.addColorStop(0.3, '#4B8B3B');
            reedGradient.addColorStop(0.7, '#6BA54A');
            reedGradient.addColorStop(1, '#2D5016');
            
            this.ctx.fillStyle = reedGradient;
            this.ctx.fillRect(segmentX, segmentY, segmentWidth, 8);
            
            // 芦苇纹理线条
            if (i % 2 === 0) {
                this.ctx.strokeStyle = 'rgba(45, 80, 22, 0.6)';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(segmentX + 2, segmentY + 2);
                this.ctx.lineTo(segmentX + segmentWidth - 2, segmentY + 6);
                this.ctx.stroke();
            }
        }
        
        // 芦苇顶部的穗子
        const topY = obstacle.y;
        const topX = obstacle.x + obstacle.width / 2;
        
        this.ctx.fillStyle = '#8B4513';
        this.ctx.beginPath();
        this.ctx.ellipse(topX, topY - 5, 3, 8, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 穗子的细节
        this.ctx.strokeStyle = '#654321';
        this.ctx.lineWidth = 0.5;
        for (let j = 0; j < 5; j++) {
            this.ctx.beginPath();
            this.ctx.moveTo(topX - 2 + j, topY - 8);
            this.ctx.lineTo(topX - 1 + j, topY - 2);
            this.ctx.stroke();
        }
    }
    
    drawCollectibles() {
        this.collectibles.forEach(collectible => {
            if (collectible.collected) return;
            
            const centerX = collectible.x + collectible.width / 2;
            const centerY = collectible.y + collectible.height / 2;
            
            this.ctx.save();
            this.ctx.translate(centerX, centerY);
            
            // 绘制光晕效果
            const glowGradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 25);
            glowGradient.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
            glowGradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.2)');
            glowGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
            
            this.ctx.fillStyle = glowGradient;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 25, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 旋转花朵
            this.ctx.rotate(collectible.rotation);
            
            // 绘制美丽的睡莲花朵
            this.drawLotusFlower();
            
            this.ctx.restore();
            
            // 绘制漂浮动画
            const floatOffset = Math.sin(this.frame * 0.05 + centerX * 0.01) * 2;
            this.ctx.save();
            this.ctx.translate(centerX, centerY + floatOffset);
            
            // 水面涟漪效果
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(0, 15, 12, 0, Math.PI * 2);
            this.ctx.stroke();
            
            this.ctx.restore();
        });
    }
    
    drawLotusFlower() {
        // 外层花瓣 - 白色
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2) / 8;
            const petalX = Math.cos(angle) * 10;
            const petalY = Math.sin(angle) * 10;
            
            this.ctx.save();
            this.ctx.translate(petalX, petalY);
            this.ctx.rotate(angle);
            
            // 花瓣渐变
            const petalGradient = this.ctx.createLinearGradient(-6, 0, 6, 0);
            petalGradient.addColorStop(0, '#FFFFFF');
            petalGradient.addColorStop(0.5, '#FFF8E7');
            petalGradient.addColorStop(1, '#FFE4B5');
            
            this.ctx.fillStyle = petalGradient;
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 花瓣边缘
            this.ctx.strokeStyle = 'rgba(255, 192, 203, 0.5)';
            this.ctx.lineWidth = 0.5;
            this.ctx.stroke();
            
            this.ctx.restore();
        }
        
        // 内层花瓣 - 粉色
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI * 2) / 6 + Math.PI / 6;
            const petalX = Math.cos(angle) * 6;
            const petalY = Math.sin(angle) * 6;
            
            this.ctx.save();
            this.ctx.translate(petalX, petalY);
            this.ctx.rotate(angle);
            
            const innerPetalGradient = this.ctx.createLinearGradient(-4, 0, 4, 0);
            innerPetalGradient.addColorStop(0, '#FFB6C1');
            innerPetalGradient.addColorStop(0.5, '#FFC0CB');
            innerPetalGradient.addColorStop(1, '#FFCCCB');
            
            this.ctx.fillStyle = innerPetalGradient;
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.restore();
        }
        
        // 花心 - 金黄色
        const centerGradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 4);
        centerGradient.addColorStop(0, '#FFD700');
        centerGradient.addColorStop(0.5, '#FFC107');
        centerGradient.addColorStop(1, '#FF8F00');
        
        this.ctx.fillStyle = centerGradient;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 花蕊细节
        this.ctx.fillStyle = '#FF6347';
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI * 2) / 6;
            const stamenX = Math.cos(angle) * 2;
            const stamenY = Math.sin(angle) * 2;
            
            this.ctx.beginPath();
            this.ctx.arc(stamenX, stamenY, 0.5, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    drawParticles() {
        this.particles.forEach(particle => {
            this.ctx.save();
            this.ctx.globalAlpha = particle.alpha;
            
            // 根据粒子类型绘制不同效果
            if (particle.type === 'water') {
                this.drawWaterDroplet(particle);
            } else if (particle.type === 'sparkle') {
                this.drawSparkle(particle);
            } else if (particle.type === 'petal') {
                this.drawPetal(particle);
            } else {
                // 默认粒子效果
                const particleGradient = this.ctx.createRadialGradient(
                    particle.x, particle.y, 0,
                    particle.x, particle.y, particle.size
                );
                particleGradient.addColorStop(0, particle.color);
                particleGradient.addColorStop(1, particle.color.replace('rgb', 'rgba').replace(')', ', 0)'));
                
                this.ctx.fillStyle = particleGradient;
                this.ctx.beginPath();
                this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            this.ctx.restore();
        });
    }
    
    drawWaterDroplet(particle) {
        // 水滴形状
        this.ctx.fillStyle = 'rgba(173, 216, 230, ' + particle.alpha + ')';
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y + 1, particle.size * 0.8, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 水滴高光
        this.ctx.fillStyle = 'rgba(255, 255, 255, ' + (particle.alpha * 0.6) + ')';
        this.ctx.beginPath();
        this.ctx.arc(particle.x - 1, particle.y - 1, particle.size * 0.3, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    drawSparkle(particle) {
        // 星光效果
        this.ctx.strokeStyle = particle.color;
        this.ctx.lineWidth = 1;
        this.ctx.lineCap = 'round';
        
        const size = particle.size;
        // 十字星光
        this.ctx.beginPath();
        this.ctx.moveTo(particle.x - size, particle.y);
        this.ctx.lineTo(particle.x + size, particle.y);
        this.ctx.moveTo(particle.x, particle.y - size);
        this.ctx.lineTo(particle.x, particle.y + size);
        this.ctx.stroke();
        
        // 对角线星光
        this.ctx.beginPath();
        this.ctx.moveTo(particle.x - size * 0.7, particle.y - size * 0.7);
        this.ctx.lineTo(particle.x + size * 0.7, particle.y + size * 0.7);
        this.ctx.moveTo(particle.x + size * 0.7, particle.y - size * 0.7);
        this.ctx.lineTo(particle.x - size * 0.7, particle.y + size * 0.7);
        this.ctx.stroke();
    }
    
    drawPetal(particle) {
        // 花瓣粒子效果
        this.ctx.save();
        this.ctx.translate(particle.x, particle.y);
        this.ctx.rotate(particle.rotation);
        
        // 花瓣形状
        const petalGradient = this.ctx.createLinearGradient(-particle.size, 0, particle.size, 0);
        petalGradient.addColorStop(0, particle.color);
        petalGradient.addColorStop(0.5, particle.color.replace('1)', '0.8)'));
        petalGradient.addColorStop(1, particle.color.replace('1)', '0.4)'));
        
        this.ctx.fillStyle = petalGradient;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, particle.size, particle.size * 0.6, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 花瓣纹理
        this.ctx.strokeStyle = particle.color.replace('1)', '0.6)');
        this.ctx.lineWidth = 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -particle.size * 0.6);
        this.ctx.lineTo(0, particle.size * 0.6);
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    drawGameUI() {
        if (this.gameState === 'waiting') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = 'bold 32px Inter, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('睡莲跑酷', this.canvas.width/2, this.canvas.height/2 - 40);
            
            this.ctx.font = '16px Inter, sans-serif';
            this.ctx.fillText('点击开始游戏或按空格键跳跃', this.canvas.width/2, this.canvas.height/2 + 20);
        }
        
        if (this.gameState === 'paused') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = 'bold 24px Inter, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('游戏暂停', this.canvas.width/2, this.canvas.height/2);
        }
        
        if (this.gameState === 'gameOver') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = 'bold 28px Inter, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('游戏结束', this.canvas.width/2, this.canvas.height/2 - 40);
            
            this.ctx.font = '18px Inter, sans-serif';
            this.ctx.fillText(`得分: ${Math.floor(this.score)}`, this.canvas.width/2, this.canvas.height/2);
            this.ctx.fillText(`最高分: ${this.highScore}`, this.canvas.width/2, this.canvas.height/2 + 25);
            
            this.ctx.font = '14px Inter, sans-serif';
            this.ctx.fillText('点击重新开始', this.canvas.width/2, this.canvas.height/2 + 60);
        }
    }
    
    updateScoreDisplay() {
        const scoreElement = document.getElementById('score');
        const highScoreElement = document.getElementById('highScore');
        
        if (scoreElement) {
            scoreElement.textContent = Math.floor(this.score);
        }
        
        if (highScoreElement) {
            highScoreElement.textContent = this.highScore;
        }
    }
    
    updateUI() {
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        
        if (startBtn && pauseBtn) {
            switch (this.gameState) {
                case 'waiting':
                case 'gameOver':
                    startBtn.style.display = 'inline-block';
                    startBtn.textContent = this.gameState === 'gameOver' ? '重新开始' : '开始游戏';
                    pauseBtn.style.display = 'none';
                    break;
                case 'playing':
                    startBtn.style.display = 'none';
                    pauseBtn.style.display = 'inline-block';
                    pauseBtn.textContent = '暂停';
                    break;
                case 'paused':
                    startBtn.style.display = 'none';
                    pauseBtn.style.display = 'inline-block';
                    pauseBtn.textContent = '继续';
                    break;
            }
        }
    }
    
    showNotification(message, type) {
        // 使用现有的通知系统
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        }
    }
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', function() {
    // 等待一下确保DOM完全加载
    setTimeout(() => {
        if (document.getElementById('gameCanvas')) {
            new WaterLilyRunner();
        }
    }, 100);
});
