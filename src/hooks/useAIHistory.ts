import { useState, useCallback } from 'react';

export interface AIMessage {
  id: string;
  activityId: string;
  activityTitle: string;
  activityOrder: number;
  message: string;
  isSuccess: boolean;
  timestamp: Date;
}

interface UseAIHistoryReturn {
  messages: AIMessage[];
  addMessage: (message: Omit<AIMessage, 'id' | 'timestamp'>) => void;
  getMessageForActivity: (activityId: string) => AIMessage | undefined;
  messageCount: number;
  latestMessage: AIMessage | undefined;
}

export function useAIHistory(): UseAIHistoryReturn {
  const [messages, setMessages] = useState<AIMessage[]>([]);

  const addMessage = useCallback((msg: Omit<AIMessage, 'id' | 'timestamp'>) => {
    const newMessage: AIMessage = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    setMessages(prev => [newMessage, ...prev]);
  }, []);

  const getMessageForActivity = useCallback((activityId: string) => {
    return messages.find(m => m.activityId === activityId);
  }, [messages]);

  return {
    messages,
    addMessage,
    getMessageForActivity,
    messageCount: messages.length,
    latestMessage: messages[0],
  };
}
