import { Controller, Get, Query, Req, Res, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as https from 'https';
import * as http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ProxyPoolService } from './proxy-pool.service';

@Controller('music')
export class MusicBotController {

    constructor(private readonly proxyPool: ProxyPoolService) {}

    @Get('stream')
    streamMusic(@Req() req: Request, @Res() res: Response, @Query('url') streamUrl: string) {
        if (!streamUrl) {
            throw new HttpException('Stream URL is required', HttpStatus.BAD_REQUEST);
        }

        try {
            const urlObj = new URL(streamUrl);
            const isPiped = streamUrl.includes('piped');
            const isYtUrl = streamUrl.includes('googlevideo.com');

            // Sadece Youtube IP'lerine ve Piped API'lerine izin ver
            if (!isPiped && !isYtUrl) {
                throw new HttpException('Invalid stream source', HttpStatus.FORBIDDEN);
            }

            const client = urlObj.protocol === 'https:' ? https : http;

            const headers: any = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            };

            // İstemci (tarayıcı) süre atlatma yaptığında gelen Range header'ını Youtube'a ilet
            if (req.headers.range) {
                headers['Range'] = req.headers.range;
            }

            const options: https.RequestOptions | http.RequestOptions = { headers };

            // Rotating proxy havuzundan proxy seç
            const proxy = this.proxyPool.getRandomProxy();
            if (proxy) {
                options.agent = new HttpsProxyAgent(proxy.url);
            }

            const request = client.get(streamUrl, options, (response) => {
                // Eğer HTTP 301/302 Redirect dönerse, yeni lokasyona yönlen (özellikle Piped için)
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const newUrl = response.headers.location;
                    if (newUrl) {
                        return this.streamMusic(req, res, newUrl);
                    }
                }

                if (!response.statusCode || response.statusCode >= 400) {
                    if (!res.headersSent) {
                        res.status(response.statusCode || 500).send('Stream fetch failed');
                    }
                    return;
                }

                // Gerekli yanıt başlıklarını sunucudan istemciye (tarayıcıya) aktar
                const headersToForward = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
                headersToForward.forEach(h => {
                    if (response.headers[h]) res.setHeader(h, response.headers[h] as string);
                });

                res.status(response.statusCode);
                response.pipe(res);
            });

            request.on('error', (err) => {
                console.error('Stream proxy error:', err.message);
                if (!res.headersSent) {
                    res.status(502).send('Failed to stream audio');
                }
            });

            // İstemci (tarayıcı) bağlantıyı kapatırsa, biz de Youtube bağlantısını kapatalım
            req.on('close', () => {
                request.destroy();
            });

        } catch (error) {
            throw new HttpException('Failed to stream audio due to invalid URL format', HttpStatus.BAD_REQUEST);
        }
    }
}
