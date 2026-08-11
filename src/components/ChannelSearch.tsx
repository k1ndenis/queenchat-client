import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../lib/redux/hooks';
import { fetchWithAuth } from '../lib/api';
import { translations } from '../lib/locales';
import Avatar from './Avatar';

interface Channel {
  id: string;
  name: string;
  avatar: string | null;
  chat_type: string;
  participants: { user_id: string; username: string; avatar: string | null }[];
  created_by: string;
}

export default function ChannelSearch() {
  const navigate = useNavigate();
  const { user } = useAppSelector(state => state.user);
  const language = useAppSelector(state => state.user.language);
  const t = translations[language as keyof typeof translations];
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [filteredChannels, setFilteredChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });

  useEffect(() => {
    if (!isOpen) return;

    const loadChannels = async () => {
      setLoading(true);
      try {
        const response = await fetchWithAuth(`/chats/?type=channel`);
        if (!response.ok) throw new Error(t.failedToLoadChannels);
        const data = await response.json();
        if (Array.isArray(data)) {
          setChannels(data);
          setFilteredChannels(data);
        }
      } catch (error) {
        console.error('Error loading channels:', error);
        setModal({
          isOpen: true,
          title: t.error,
          message: t.failedToLoadChannels,
        });
      } finally {
        setLoading(false);
      }
    };

    loadChannels();
  }, [isOpen]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredChannels(channels);
    } else {
      const filtered = channels.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredChannels(filtered);
    }
  }, [searchQuery, channels]);

  const subscribeToChannel = async (channelId: string, channelName: string) => {
    setSubscribing(channelId);
    try {
      const response = await fetchWithAuth(`/chats/${channelId}/subscribe`, {
        method: 'POST',
      });

      if (response.ok) {
        setModal({
          isOpen: true,
          title: t.success,
          message: `${t.channelSubscribedPrefix} "${channelName}"`,
        });
        window.dispatchEvent(new Event('refreshChatList'));
        setTimeout(() => {
          navigate(`/chat/${channelId}`);
        }, 1500);
      } else {
        const data = await response.json();
        setModal({
          isOpen: true,
          title: t.error,
          message: data.detail || t.failedToSubscribeChannel,
        });
      }
    } catch (error) {
      console.error('Error subscribing to channel:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: t.failedToSubscribeChannel,
      });
    } finally {
      setSubscribing(null);
    }
  };

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
    setIsOpen(false);
  };

  const isSubscribed = (channel: Channel) => {
    if (!user) return false;
    return channel.participants?.some(p => p.user_id === user.id);
  };

  const isCreator = (channel: Channel) => {
    if (!user) return false;
    return channel.created_by === user.id;
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 shadow-lg flex items-center justify-center hover:scale-105 transition duration-300 hover:shadow-xl"
        title={t.searchChannels}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">{t.searchChannels}</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.channelNamePlaceholder}
              className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
              autoFocus
            />

            {loading ? (
              <div className="text-center text-purple-300 py-8">{t.loading}</div>
            ) : filteredChannels.length === 0 ? (
              <div className="text-center text-purple-300 py-8">
                {searchQuery ? t.channelsNotFound : t.noAvailableChannels}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredChannels.map(channel => {
                  const subscribed = isSubscribed(channel);
                  const creator = isCreator(channel);
                  const showSubscribeButton = !subscribed && !creator;

                  return (
                    <div
                      key={channel.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/10 hover:bg-white/20 transition"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Avatar
                          isChannel={true}
                          size="md"
                          src={channel.avatar || undefined}
                        />
                        <div>
                          <p className="text-white font-medium">{channel.name}</p>
                          <p className="text-xs text-purple-300">
                            📢 {channel.participants?.length || 0} {t.subscribers}
                          </p>
                        </div>
                      </div>
                      {showSubscribeButton && (
                        <button
                          onClick={() => subscribeToChannel(channel.id, channel.name)}
                          disabled={subscribing === channel.id}
                          className="px-4 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm rounded-lg hover:opacity-90 transition disabled:opacity-50"
                        >
                          {subscribing === channel.id ? '...' : t.subscribe}
                        </button>
                      )}
                      {!showSubscribeButton && (
                        <span className={`px-3 py-1 text-sm rounded-lg ${
                          creator 
                            ? 'bg-yellow-500/20 text-yellow-400' 
                            : 'bg-green-500/20 text-green-400'
                        }`}>
                          {creator ? t.youAreCreator : t.youAreSubscribed}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {modal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[101]">
          <div className={`bg-gradient-to-br rounded-2xl p-6 w-full max-w-md mx-4 ${
            modal.title === t.success 
              ? 'from-green-800 to-green-900' 
              : 'from-slate-800 to-purple-900'
          }`}>
            <div className="text-center mb-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${
                modal.title === t.success 
                  ? 'bg-green-500/20' 
                  : 'bg-red-500/20'
              }`}>
                {modal.title === t.success ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="green" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                ) : (
                  <span className="text-3xl">⚠️</span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-white">{modal.title}</h2>
              <p className="text-purple-200 mt-2">{modal.message}</p>
            </div>
            <button
              onClick={closeModal}
              className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition"
            >
              {t.ok}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
