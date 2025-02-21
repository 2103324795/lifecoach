import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const port = process.env.PORT || 3456;

// 启用CORS
app.use(cors());
app.use(express.json());

// 配置静态文件服务
app.use(express.static('.'));

// DeepSeek API配置
const API_KEY = process.env.DEEPSEEK_API_KEY || '18e034cd-1505-4fda-8edd-250f4fe815fa';
const API_URL = process.env.DEEPSEEK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

// 检查API配置
if (!API_KEY) {
    console.error('错误: 未设置DEEPSEEK_API_KEY环境变量');
    process.exit(1);
}

// 处理聊天请求
app.post('/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;

        // 设置响应头以支持流式输出
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // 准备请求体
        const requestBody = {
            model: 'deepseek-r1-250120',
            messages: [
                {
                    role: 'system',
                    content: '你是一位专业的生活教练，擅长倾听、分析和给出建设性的建议。你的目标是通过对话帮助用户实现个人成长，提供积极、实用的指导。'
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ],
            stream: true,
            temperature: 0.6
        };

        // 发送请求到DeepSeek API
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(requestBody),
            timeout: 120000 // 设置120秒超时
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('API错误详情:', errorData);
            console.error('API响应状态码:', response.status);
            console.error('API响应头:', JSON.stringify(response.headers.raw()));
            
            // 构建详细的错误信息
            let errorMessage = '服务暂时不可用';
            if (errorData.includes('FUNCTION_INVOCATION_TIMEOUT')) {
                errorMessage = '由于问题较复杂，处理时间超出限制。请尝试将问题拆分为更小的部分，或稍后重试。';
            } else if (response.status === 429) {
                errorMessage = '请求过于频繁，请稍后再试。';
            } else if (response.status === 503) {
                errorMessage = '服务器暂时不可用，请稍后重试。';
            }
            
            res.status(response.status).json(errorMessage);
            return;
        }

        // 处理流式响应
        const chunks = [];
        response.body.on('data', chunk => {
            const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') continue;
                    
                    try {
                        const jsonData = JSON.parse(jsonStr);
                        if (jsonData.choices && jsonData.choices[0].delta.content) {
                            const content = jsonData.choices[0].delta.content;
                            chunks.push(content);
                            res.write(content);
                        }
                    } catch (e) {
                        console.error('JSON解析错误:', e);
                        console.error('原始数据:', jsonStr);
                    }
                }
            }
        });

        response.body.on('end', () => {
            if (chunks.length === 0) {
                res.status(500).json({
                    error: '未收到有效的API响应',
                    message: '服务器未能获取到任何有效的响应内容'
                });
            } else {
                res.end();
            }
        });

        response.body.on('error', error => {
            console.error('Stream error:', error);
            console.error('错误堆栈:', error.stack);
            res.status(500).json({
                error: '流处理错误',
                message: error.message,
                stack: error.stack
            });
        });

        // 移除这里的 res.end() 调用，因为它会过早终止响应
        // res.end();
    } catch (error) {
        console.error('Error:', error);
        console.error('错误堆栈:', error.stack);
        console.error('请求体:', JSON.stringify(requestBody));
        res.status(500).json({
            error: '服务器处理错误',
            message: error.message,
            stack: error.stack,
            requestBody: requestBody
        });
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});