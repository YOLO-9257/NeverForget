
/**
 * 消息详情页 HTML 模板
 * 移植自 msg_detail.html
 */
export const DETAIL_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>消息推送</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
        }
       
        body {
            background: linear-gradient(135deg, #0c0c2e 0%, #1a1a3e 100%);
            color: #e0f7fa;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            overflow-x: hidden;
            position: relative;
        }
       
        /* 动态背景效果 */
        body::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background:
                radial-gradient(circle at 20% 30%, rgba(0, 150, 136, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 80% 70%, rgba(0, 188, 212, 0.15) 0%, transparent 50%);
            z-index: -1;
        }
       
        .container {
            max-width: 800px;
            width: 100%;
            background: rgba(18, 18, 40, 0.85);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5),
                        0 0 0 1px rgba(0, 150, 136, 0.2),
                        0 0 20px rgba(0, 188, 212, 0.3);
            position: relative;
            overflow: hidden;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
       
        .container:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6),
                        0 0 0 1px rgba(0, 150, 136, 0.4),
                        0 0 30px rgba(0, 188, 212, 0.5);
        }
       
        .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: linear-gradient(90deg, #00bcd4, #009688);
        }
       
        .title {
            text-align: center;
            margin-bottom: 40px;
            font-size: 2.2rem;
            font-weight: 300;
            letter-spacing: 2px;
            color: #00bcd4;
            position: relative;
            padding-bottom: 15px;
        }
       
        .title::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 100px;
            height: 2px;
            background: linear-gradient(90deg, transparent, #00bcd4, transparent);
        }
       
        .info-card {
            background: rgba(30, 30, 60, 0.7);
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 25px;
            border-left: 4px solid #00bcd4;
            transition: all 0.3s ease;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
       
        .info-card:hover {
            transform: translateX(5px);
            background: rgba(40, 40, 70, 0.8);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
        }
       
        .info-label {
            font-size: 1.3rem;
            color: #80deea;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
        }
       
        .info-label::before {
            content: '';
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #00bcd4;
            margin-right: 10px;
        }
       
        .info-content {
            font-size: 1.2rem;
            color: #e0f7fa;
            font-weight: 500;
            word-break: break-word;
            line-height: 1.6;
            white-space: pre-line;
        }
       
        .pulse {
            animation: pulse 2s infinite;
        }
       
        @keyframes pulse {
            0% {
                box-shadow: 0 0 0 0 rgba(0, 188, 212, 0.4);
            }
            70% {
                box-shadow: 0 0 0 10px rgba(0, 188, 212, 0);
            }
            100% {
                box-shadow: 0 0 0 0 rgba(0, 188, 212, 0);
            }
        }
       
        /* Markdown 样式覆盖 */
        .info-content h1, .info-content h2, .info-content h3, .info-content h4, .info-content h5, .info-content h6 {
            color: #00bcd4;
            margin-top: 1em;
            margin-bottom: 0.5em;
            font-weight: 400;
        }
        .info-content p {
            margin-bottom: 1em;
            line-height: 1.6;
        }
        .info-content strong {
            color: #e0f7fa;
            font-weight: 600;
        }
        .info-content em {
            color: #80deea;
            font-style: italic;
        }
        .info-content code {
            background: rgba(0, 0, 0, 0.3);
            color: #00bcd4;
            padding: 2px 4px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
        }
        .info-content pre {
            background: rgba(0, 0, 0, 0.4);
            color: #e0f7fa;
            padding: 1em;
            border-radius: 8px;
            overflow-x: auto;
            margin-bottom: 1em;
        }
        .info-content blockquote {
            border-left: 4px solid #009688;
            margin: 1em 0;
            padding-left: 1em;
            color: #80deea;
            font-style: italic;
        }
        .info-content ul, .info-content ol {
            margin-bottom: 1em;
            padding-left: 2em;
        }
        .info-content li {
            margin-bottom: 0.5em;
        }
        .info-content a {
            color: #00bcd4;
            text-decoration: none;
        }
        .info-content a:hover {
            text-decoration: underline;
        }
        .info-content table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 1em;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            overflow: hidden;
        }
        .info-content th, .info-content td {
            padding: 0.75em;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .info-content th {
            background: rgba(0, 188, 212, 0.2);
            color: #00bcd4;
        }
       
        /* 响应式设计 */
        @media (max-width: 768px) {
            .container {
                padding: 25px;
            }
           
            .title {
                font-size: 1.9rem;
            }
           
            .info-content {
                font-size: 1.1rem;
            }
           
            .info-label {
                font-size: 1.2rem;
            }
        }
       
        @media (max-width: 480px) {
            .container {
                padding: 20px;
            }
           
            .title {
                font-size: 1.6rem;
            }
           
            .info-content {
                font-size: 1rem;
            }
           
            .info-card {
                padding: 20px;
            }
           
            .info-label {
                font-size: 1.1rem;
            }
        }
       
        /* 动态粒子背景 */
        .particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            overflow: hidden;
        }
       
        .particle {
            position: absolute;
            background: rgba(0, 188, 212, 0.3);
            border-radius: 50%;
            animation: float 15s infinite linear;
        }
       
        @keyframes float {
            0% {
                transform: translateY(0) translateX(0);
                opacity: 0;
            }
            10% {
                opacity: 1;
            }
            90% {
                opacity: 1;
            }
            background: rgba(0, 0, 0, 0.9);
            z-index: 9999;
            text-align: center;
            padding-top: 50px;
        }
        .wx-mask-content {
            color: #fff;
            font-size: 1.4rem;
            padding: 20px;
            max-width: 80%;
            margin: 0 auto;
        }
        .wx-arrow {
            position: absolute;
            top: 10px;
            right: 20px;
            width: 60px;
            height: 60px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 7l9-4-4 9'/%3E%3Cpath d='M18.8 3.2L3 21'/%3E%3C/svg%3E");
            background-size: contain;
            background-repeat: no-repeat;
            transform: rotate(15deg);
            animation: bounce 2s infinite;
        }
        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {transform: translateY(0) rotate(15deg);}
            40% {transform: translateY(-10px) rotate(15deg);}
            60% {transform: translateY(-5px) rotate(15deg);}
        }
        
    </style>
</head>
<body>
    <div class="particles" id="particles"></div>
   
    <!-- 微信引导遮罩 -->
    <div class="wx-mask" id="wxMask">
        <div class="wx-arrow"></div>
        <div class="wx-mask-content">
            <p>由于微信安全限制</p>
            <p style="margin-top:15px;color:#00bcd4;font-weight:bold;">请点击右上角 &#xFE19;</p>
            <p style="margin-top:10px;">选择 <span style="border:1px solid #fff;padding:2px 5px;border-radius:4px;">在浏览器打开</span></p>
            <p style="margin-top:30px;font-size:1rem;opacity:0.7;">To view the content, please open in a system browser.</p>
        </div>
    </div>

    <div class="container pulse" id="mainContainer">
        <div class="title" id="title">消息推送</div>
       
        <div class="info-card">
            <div class="info-label">通知内容</div>
            <div class="info-content" id="message">无告警信息</div>
        </div>
       
        <div class="info-card">
            <div class="info-label">时间</div>
            <div class="info-content" id="date">无时间信息</div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js"></script>
    <script>
        // 检测微信环境
        function checkWechat() {
            var ua = navigator.userAgent.toLowerCase();
            if (ua.match(/MicroMessenger/i) == "micromessenger") {
                document.getElementById('wxMask').style.display = 'block';
                document.getElementById('mainContainer').style.display = 'none'; // 隐藏内容以防误判
                return true;
            }
            return false;
        }

        // 从 URL 参数读取数据
        function getUrlParams() {
            const urlParams = new URLSearchParams(window.location.search);
            return {
                title: urlParams.get('title') || '消息推送',
                message: urlParams.get('message') || '无告警信息',
                date: urlParams.get('date') || '无时间信息'
            };
        }

        // 创建动态粒子背景
        function createParticles() {
            const particlesContainer = document.getElementById('particles');
            const particleCount = 25;
            const colors = [
                'rgba(0, 188, 212, 0.2)',
                'rgba(0, 150, 136, 0.2)',
                'rgba(77, 182, 172, 0.15)'
            ];
           
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.classList.add('particle');
               
                const size = Math.random() * 3 + 1;
                particle.style.width = \`\${size}px\`;
                particle.style.height = \`\${size}px\`;
               
                const randomColor = colors[Math.floor(Math.random() * colors.length)];
                particle.style.background = randomColor;
               
                particle.style.left = \`\${Math.random() * 100}%\`;
                particle.style.top = \`\${Math.random() * 100}%\`;
               
                particle.style.animationDelay = \`\${Math.random() * 20}s\`;
                particle.style.animationDuration = \`\${20 + Math.random() * 15}s\`;
               
                particlesContainer.appendChild(particle);
            }
        }

        // 处理 Markdown 渲染
        function renderMarkdown() {
            const messageEl = document.getElementById('message');
            if (messageEl && typeof marked !== 'undefined') {
                const markdownText = messageEl.textContent || messageEl.innerText;
                messageEl.innerHTML = marked.parse(markdownText);
            }
        }

        // 填充页面内容
        function fillContent() {
            const params = getUrlParams();
            document.getElementById('title').textContent = params.title;
            document.getElementById('message').textContent = params.message;
            document.getElementById('date').textContent = params.date;
            renderMarkdown(); // 渲染 Markdown
        }

        // 页面加载时调用
        window.onload = function() {
            // 如果是微信，先显示遮罩，暂不渲染内容（或渲染了也被隐藏）
            const isWechat = checkWechat();
            
            // 粒子特效依然加载，增加氛围
            createParticles();
            
            // 填充内容 (即使用户看不到，也先填好，以便跳转后逻辑一致)
            fillContent();
        };
    </script>
</body>
</html>`;
// 自定义 HTML 渲染功能已移交给 go-wxpush 服务
// never-forget 仅通过 template_name 引用 go-wxpush 中的模板
