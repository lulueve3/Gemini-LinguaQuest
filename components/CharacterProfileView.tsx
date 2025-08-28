import { EquipmentItem, SkillItem } from '../types';

interface Props {
    equipment: EquipmentItem[];
    skills: SkillItem[];
    onClose: () => void;
}

const CharacterProfileView: React.FC<Props> = ({ equipment, skills, onClose }) => {
    return (
        <div className="p-4 md:p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-purple-300">Character Profile</h2>
                <button onClick={onClose} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all">Back to Game</button>
            </div>

            <div className="mb-8">
                <h3 className="text-xl font-semibold mb-2">Equipment</h3>
                {equipment.length > 0 ? (
                    <ul className="space-y-2">
                        {equipment.map((item, index) => (
                            <li key={index} className="bg-gray-800/50 p-3 rounded">
                                <span className="font-bold">{item.name}</span> - <span className="text-gray-400">{item.description}</span>{item.equipped ? ' (equipped)' : ''}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-400">No equipment.</p>
                )}
            </div>

            <div>
                <h3 className="text-xl font-semibold mb-2">Skills</h3>
                {skills.length > 0 ? (
                    <ul className="space-y-2">
                        {skills.map((skill, index) => (
                            <li key={index} className="bg-gray-800/50 p-3 rounded">
                                <span className="font-bold">{skill.name}</span> - Lv {skill.level} {skill.isActive ? '(active)' : ''}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-400">No skills.</p>
                )}
            </div>
        </div>
    );
};

export default CharacterProfileView;
