import React from 'react';
import { ChoiceItem } from '../types';

interface ChoiceButtonProps {
    item: ChoiceItem;
    onClick: () => void;
    disabled: boolean;
}

const ChoiceButton: React.FC<ChoiceButtonProps> = ({ item, onClick, disabled }) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="w-full text-left bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-lg px-6 py-4 text-gray-300 hover:bg-gray-700/70 hover:border-gray-500/70 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
        >
            <span className="block text-base">{item.choice}</span>
            <span className="block text-sm text-gray-400 mt-1">{item.translatedChoice}</span>
        </button>
    );
};

export default ChoiceButton;