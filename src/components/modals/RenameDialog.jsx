import React, { useState, useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';

export default function RenameDialog({ isOpen, onClose, initialName, onRename, position }) {
  const [name, setName] = useState(initialName);
  const dialogRef = useRef(null);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onRename(name);
      onClose();
    }
  };

  if (!isOpen) return null;

  const style = {
    position: 'absolute',
    left: `${position.x}px`,
    top: `${position.y}px`,
  };

  return (
    <div 
      ref={dialogRef}
      className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-64 z-50"
      style={style}
    >
      <form onSubmit={handleSubmit} className="p-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-gray-700 text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
            autoFocus
          />
          <button
            type="submit"
            className="p-1 text-green-500 hover:text-green-400"
            title="변경"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-300"
            title="취소"
          >
            <X size={16} />
          </button>
        </div>
      </form>
    </div>
  );
} 