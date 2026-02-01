import React from 'react';
import './PingMeter.css';

interface PingMeterProps {
    ping: number;
    status: 'good' | 'medium' | 'bad';
}

export const PingMeter: React.FC<PingMeterProps> = ({ ping, status }) => {
    const getBars = () => {
        if (status === 'good') return 4;
        if (status === 'medium') return 2;
        return 1;
    };

    const activeBars = getBars();

    return (
        <div className={`ping-meter ${status}`} title={`Ping: ${ping}ms`}>
            <div className="ping-bars">
                {[1, 2, 3, 4].map((bar) => (
                    <div
                        key={bar}
                        className={`ping-bar bar-${bar} ${bar <= activeBars ? 'active' : ''}`}
                    />
                ))}
            </div>
            <span className="ping-value">{ping > 0 ? `${ping}ms` : '...'}</span>
        </div>
    );
};
