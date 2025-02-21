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
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = process.env.DEEPSEEK_API_URL;

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
            timeout: 60000 // 设置60秒超时
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('API错误详情:', errorData);
            res.status(response.status).send(errorData);
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
                            res.write(jsonData.choices[0].delta.content);
                        }
                    } catch (e) {
                        console.error('JSON解析错误:', e);
                    }
                }
            }
        });

        response.body.on('end', () => {
            res.end();
        });

        response.body.on('error', error => {
            console.error('Stream error:', error);
            res.status(500).send('服务器错误');
        });

        // 移除这里的 res.end() 调用，因为它会过早终止响应
        // res.end();
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send(error.message || '服务器错误');
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});