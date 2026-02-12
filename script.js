// 打字机效果
const typingText = document.querySelector('.typing-text');
const texts = ['前端开发者', 'UI设计师', '创意工作者', '问题解决者'];
let textIndex = 0;
let charIndex = 0;
let isDeleting = false;
let typingSpeed = 100;

function typeWriter() {
    const currentText = texts[textIndex];
    
    if (isDeleting) {
        typingText.textContent = currentText.substring(0, charIndex - 1);
        charIndex--;
        typingSpeed = 50;
    } else {
        typingText.textContent = currentText.substring(0, charIndex + 1);
        charIndex++;
        typingSpeed = 100;
    }
    
    if (!isDeleting && charIndex === currentText.length) {
        isDeleting = true;
        typingSpeed = 2000; // 暂停时间
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        textIndex = (textIndex + 1) % texts.length;
        typingSpeed = 500;
    }
    
    setTimeout(typeWriter, typingSpeed);
}

// 启动打字机效果
typeWriter();

// SVG文字动画
const letters = document.querySelectorAll('.letter');
letters.forEach((letter, index) => {
    letter.style.animationDelay = `${index * 0.1}s`;
    
    // 鼠标悬停效果
    letter.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.2) rotate(5deg)';
    });
    
    letter.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1) rotate(0deg)';
    });
});

// 平滑滚动
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// 滚动时导航栏效果
let lastScroll = 0;
const header = document.querySelector('.header');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 100) {
        header.style.transform = 'translateY(-20px)';
        header.style.opacity = '0.8';
    } else {
        header.style.transform = 'translateY(0)';
        header.style.opacity = '1';
    }
    
    lastScroll = currentScroll;
});

// 作品卡片悬停效果
const workCards = document.querySelectorAll('.work-card');
workCards.forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.querySelector('.work-image img').style.transform = 'scale(1.1) rotate(2deg)';
    });
    
    card.addEventListener('mouseleave', function() {
        this.querySelector('.work-image img').style.transform = 'scale(1) rotate(0deg)';
    });
});

// 博客卡片悬停效果
const blogCards = document.querySelectorAll('.blog-card');
blogCards.forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.querySelector('.blog-image img').style.transform = 'scale(1.1) rotate(-2deg)';
    });
    
    card.addEventListener('mouseleave', function() {
        this.querySelector('.blog-image img').style.transform = 'scale(1) rotate(0deg)';
    });
});

// 社交链接动画
const socialLinks = document.querySelectorAll('.social-link');
socialLinks.forEach((link, index) => {
    link.style.animationDelay = `${index * 0.1}s`;
    
    link.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-10px) rotate(360deg) scale(1.2)';
    });
    
    link.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) rotate(0deg) scale(1)';
    });
});

// 页面加载动画
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});

// Intersection Observer for scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// 观察所有section
document.querySelectorAll('section').forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(30px)';
    section.style.transition = 'all 0.8s ease';
    observer.observe(section);
});

// 动态光效跟随鼠标
const lightEffect = document.querySelector('.light-effect');
let mouseX = 0;
let mouseY = 0;

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX / window.innerWidth;
    mouseY = e.clientY / window.innerHeight;
    
    lightEffect.style.background = `
        radial-gradient(circle at ${mouseX * 100}% ${mouseY * 100}%, rgba(255, 0, 110, 0.15) 0%, transparent 50%),
        radial-gradient(circle at ${(1 - mouseX) * 100}% ${(1 - mouseY) * 100}%, rgba(131, 56, 236, 0.15) 0%, transparent 50%),
        radial-gradient(circle at ${mouseX * 100}% ${(1 - mouseY) * 100}%, rgba(58, 134, 255, 0.15) 0%, transparent 50%)
    `;
});

// 点击涟漪效果
document.addEventListener('click', (e) => {
    const ripple = document.createElement('div');
    ripple.style.cssText = `
        position: fixed;
        width: 20px;
        height: 20px;
        background: radial-gradient(circle, rgba(255, 0, 110, 0.8), transparent);
        border-radius: 50%;
        pointer-events: none;
        transform: translate(-50%, -50%);
        animation: rippleEffect 0.6s ease-out;
        z-index: 9999;
    `;
    
    ripple.style.left = e.clientX + 'px';
    ripple.style.top = e.clientY + 'px';
    
    document.body.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
});

// 添加涟漪动画
const style = document.createElement('style');
style.textContent = `
    @keyframes rippleEffect {
        to {
            width: 200px;
            height: 200px;
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 导航链接激活状态
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
    let current = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (scrollY >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.style.color = '#888';
        if (link.getAttribute('href').slice(1) === current) {
            link.style.color = '#fff';
        }
    });
});

// 防止右键菜单（可选）
document.addEventListener('contextmenu', (e) => {
    // e.preventDefault();
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    // 按 'h' 键回到顶部
    if (e.key === 'h' || e.key === 'H') {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
    
    // 按 'ESC' 键清除所有动画
    if (e.key === 'Escape') {
        document.querySelectorAll('.work-card, .blog-card').forEach(card => {
            card.style.animation = 'none';
        });
    }
});