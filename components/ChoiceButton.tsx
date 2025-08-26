import React from 'react';
import { ChoiceItem } from '../types';

interface ChoiceButtonProps {
    item: ChoiceItem;
    onClick: () => void;
    disabled: boolean;
    isSelected?: boolean;
}

const ChoiceButton: React.FC<ChoiceButtonProps> = ({ item, onClick, disabled, isSelected }) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`w-full text-left bg-gray-800/50 backdrop-blur-sm border rounded-lg px-6 py-4 text-gray-300 transition-all duration-300 disabled:cursor-not-allowed ${
                isSelected 
                    ? 'border-purple-400 ring-2 ring-purple-400/80 bg-gray-700/80 disabled:opacity-100'
                    : 'border-gray-600/50 hover:bg-gray-700/70 hover:border-gray-500/70 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-50 transform hover:scale-105 disabled:opacity-50'
            }`}
        >
            <span className="block text-base">{item.choice}</span>
            <span className="block text-sm text-gray-400 mt-1">{item.translatedChoice}</span>
        </button>
    );
};

export default ChoiceButton;