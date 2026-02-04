import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

export class SocketIoAdapter extends IoAdapter {
    createIOServer(port: number, options?: ServerOptions): any {
        const optionsWithAllowUpgrades = {
            ...options,
            maxHttpBufferSize: 1e8, // 100 MB
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
                credentials: true,
            },
        };
        return super.createIOServer(port, optionsWithAllowUpgrades);
    }
}
