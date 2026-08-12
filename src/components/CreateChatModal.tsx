import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../lib/api';
import { useAppSelector } from '../lib/redux/hooks';
import { translations } from '../lib/locales';
import type { User } from '../types/user';
import Avatar from './Avatar';
import { getUserDisplayName, getUserUsernameLabel, userMatchesSearchQuery } from '../lib/userDisplay';

interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

type ChatType = 'private' | 'group' | 'channel';

export default function CreateChatModal({ isOpen, onClose, onChatCreated }: CreateChatModalProps) {
  const { user, language } = useAppSelector(state => state.user);
  const t = translations[language as keyof typeof translations];
  
  const [chatType, setChatType] = useState<ChatType>('private');
  const [step, setStep] = useState<'type' | 'select' | 'details'>('type');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [channelName, setChannelName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');

  const ADMIN_ID = '33f676d7-9ab6-4eaa-b3c4-d4552b499f58';

  useEffect(() => {
    if (!isOpen) return;

    const loadUsers = async () => {
      try {
        const response = await fetchWithAuth(`/auth/get_users`);
        const data = await response.json();
        if (Array.isArray(data)) {
          const otherUsers = data.filter((u: User) => u.id !== user?.id);
          
          const sortedUsers = [...otherUsers].sort((a, b) => {
            if (a.id === ADMIN_ID) return -1;
            if (b.id === ADMIN_ID) return 1;
            return getUserDisplayName(a).localeCompare(getUserDisplayName(b));
          });
          
          setUsers(sortedUsers);
          setFilteredUsers(sortedUsers);
        }
      } catch (error) {
        console.error('Error loading users:', error);
        setError(t.failedToLoadUsers);
      }
    };
    
    loadUsers();
  }, [isOpen, user?.id, t.failedToLoadUsers]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(u => userMatchesSearchQuery(u, searchQuery));
      setFilteredUsers(filtered);
    }
  }, [searchQuery, users]);

  const resetForm = () => {
    setStep('type');
    setChatType('private');
    setSearchQuery('');
    setSelectedUser(null);
    setSelectedUsers([]);
    setGroupName('');
    setChannelName('');
    setError('');
    setInviteUrl('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleTypeSelect = (type: ChatType) => {
    setChatType(type);
    if (type === 'private') {
      setStep('select');
    } else if (type === 'group') {
      setStep('details');
    } else {
      // For channels we go straight to details
      setStep('details');
    }
  };

  const handleCreatePrivate = async () => {
    if (!selectedUser) {
      setError(t.selectUser);
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/chats/private`, {
        method: 'POST',
        body: JSON.stringify({ username: selectedUser.username })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || t.failedToCreateChat);
      }
      
      const newChat = await response.json();
      onChatCreated(newChat.id);
      handleClose();
    } catch (error) {
      console.error('Error creating chat:', error);
      setError(error instanceof Error ? error.message : t.failedToCreateChat);
    } finally {
      setLoading(false);
    }
  };

  const createChatInvite = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetchWithAuth('/chats/invites', { method: 'POST' });
      if (!response.ok) throw new Error((await response.json()).detail || 'Не удалось создать приглашение');
      const data = await response.json(); setInviteUrl(data.invite_url);
    } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось создать приглашение'); }
    finally { setLoading(false); }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setError(t.enterGroupName);
      return;
    }
    
    if (selectedUsers.length < 2) {
      setError(t.chooseParticipants);
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/chats/group`, {
        method: 'POST',
        body: JSON.stringify({
          name: groupName,
          participant_ids: selectedUsers.map(u => u.username)
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || t.failedToCreateChat);
      }
      
      const newChat = await response.json();
      onChatCreated(newChat.id);
      handleClose();
    } catch (error) {
      console.error('Error creating group:', error);
      setError(error instanceof Error ? error.message : t.failedToCreateChat);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!channelName.trim()) {
      setError(t.enterChannelName);
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/chats/channel`, {
        method: 'POST',
        body: JSON.stringify({
          name: channelName
          // Не отправляем participant_ids - канал создается без подписчиков
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || t.failedToCreateChat);
      }
      
      const newChat = await response.json();
      onChatCreated(newChat.id);
      handleClose();
    } catch (error) {
      console.error('Error creating channel:', error);
      setError(error instanceof Error ? error.message : t.failedToCreateChat);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserSelection = (u: User) => {
    if (selectedUsers.find(su => su.id === u.id)) {
      setSelectedUsers(selectedUsers.filter(su => su.id !== u.id));
    } else {
      setSelectedUsers([...selectedUsers, u]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
      }}
    >
      <div role="dialog" aria-modal="true" className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-purple-900 p-5 shadow-2xl sm:max-h-[80vh] sm:p-6">
        {/* Header */}
        <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-white">
            {step === 'type' && t.createChat}
            {step === 'select' && chatType === 'private' && t.selectUser}
            {step === 'details' && chatType === 'group' && t.createConversation}
            {step === 'details' && chatType === 'channel' && t.createChannel}
          </h2>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">

        {/* Step 1: choose chat type */}
        {step === 'type' && (
          <div className="space-y-3">
            <button
              onClick={() => handleTypeSelect('private')}
              className="w-full p-4 bg-white/10 rounded-xl hover:bg-white/20 transition text-left flex items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">{t.privateChat}</p>
                <p className="text-purple-300 text-sm">{t.privateChatDesc}</p>
              </div>
            </button>

            <button
              onClick={() => handleTypeSelect('group')}
              className="w-full p-4 bg-white/10 rounded-xl hover:bg-white/20 transition text-left flex items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-green-500 to-teal-500 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">{t.groupChat}</p>
                <p className="text-purple-300 text-sm">{t.groupChatDesc}</p>
              </div>
            </button>

            <button
              onClick={() => handleTypeSelect('channel')}
              className="w-full p-4 bg-white/10 rounded-xl hover:bg-white/20 transition text-left flex items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">{t.channelChat}</p>
                <p className="text-purple-300 text-sm">{t.channelChatDesc}</p>
              </div>
            </button>
          </div>
        )}

        {/* Step 2: choose user for private chat */}
        {step === 'select' && chatType === 'private' && (
          <>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchByUsername}
              className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
              autoFocus
            />
            
            <div className="max-h-96 overflow-y-auto mb-4 space-y-2">
              {filteredUsers.length === 0 ? (
                <p className="text-purple-300 text-center py-4">
                  {searchQuery ? t.userNotFoundShort : t.noUsersAvailable}
                </p>
              ) : (
                filteredUsers.map(u => (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className={`p-3 rounded-lg cursor-pointer transition flex items-center gap-3 ${
                      selectedUser?.id === u.id
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                        : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    <Avatar userId={u.id} name={getUserDisplayName(u, t.userUnknown)} size="sm" src={u.avatar} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium">{getUserDisplayName(u, t.userUnknown)}</p>
                      {getUserUsernameLabel(u) && <p className="text-xs text-purple-300">{getUserUsernameLabel(u)}</p>}
                      {u.id === ADMIN_ID && (
                        <span className="text-xs bg-gradient-to-r from-yellow-500 to-amber-500 text-white px-1.5 py-0.5 rounded-full">
                          {t.admin}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.06] p-3">
              <p className="text-sm text-purple-100">Нужного человека ещё нет в QueenChat?</p>
              {inviteUrl ? (
                <div className="mt-3 space-y-2">
                  <label className="block text-left text-xs font-medium text-purple-200">Ссылка-приглашение</label>
                  <input readOnly value={inviteUrl} className="min-h-11 w-full rounded-lg border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-white" />
                  <button onClick={() => navigator.clipboard.writeText(inviteUrl)} className="min-h-11 w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20">Скопировать ссылку</button>
                </div>
              ) : (
                <button onClick={() => void createChatInvite()} disabled={loading} className="mt-3 min-h-11 w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-pink-100 transition hover:bg-white/20 disabled:opacity-50">
                  Пригласить человека в QueenChat
                </button>
              )}
            </div>
          </>
        )}

        {/* Step 3: group details */}
        {step === 'details' && chatType === 'group' && (
          <>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t.enterGroupName}
              className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
              autoFocus
            />
            
            <p className="text-purple-200 mb-2 text-sm">
              {t.chooseParticipants}
            </p>
            
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchByUsername}
              className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
            />
            
            <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
              {filteredUsers.length === 0 ? (
                <p className="text-purple-300 text-center py-4">
                  {searchQuery ? t.userNotFoundShort : t.noUsersAvailable}
                </p>
              ) : (
                filteredUsers.map(u => (
                  <div
                    key={u.id}
                    onClick={() => toggleUserSelection(u)}
                    className={`p-3 rounded-lg cursor-pointer transition flex items-center gap-3 ${
                      selectedUsers.find(su => su.id === u.id)
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                        : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    <Avatar userId={u.id} name={getUserDisplayName(u, t.userUnknown)} size="sm" src={u.avatar} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium">{getUserDisplayName(u, t.userUnknown)}</p>
                      {getUserUsernameLabel(u) && <p className="text-xs text-purple-300">{getUserUsernameLabel(u)}</p>}
                      {u.id === ADMIN_ID && (
                        <span className="text-xs bg-gradient-to-r from-yellow-500 to-amber-500 text-white px-1.5 py-0.5 rounded-full">
                          {t.admin}
                        </span>
                      )}
                    </div>
                    {selectedUsers.find(su => su.id === u.id) && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Step 3 for channel - name only */}
        {step === 'details' && chatType === 'channel' && (
          <>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder={t.enterChannelName}
              className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
              autoFocus
            />
          </>
        )}

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        </div>

        {/* Navigation Buttons */}
        <div className={`mt-4 shrink-0 border-t border-white/10 pt-4 ${step === 'type' ? 'hidden' : 'flex gap-3'}`}>
          {step !== 'type' && (
            <button
              onClick={() => setStep('type')}
              className="min-h-12 flex-1 rounded-lg bg-white/10 px-4 py-2 text-white transition hover:bg-white/20"
            >
              {t.back}
            </button>
          )}
          
          {step === 'select' && chatType === 'private' && (
            <button
              onClick={handleCreatePrivate}
              disabled={!selectedUser || loading}
              className={`min-h-12 flex-1 rounded-lg px-4 py-2 transition ${
                selectedUser && !loading
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 cursor-pointer'
                  : 'bg-white/20 text-white/50 cursor-not-allowed'
              }`}
            >
              {loading ? t.createLoading : t.createChat}
            </button>
          )}
          
          {step === 'details' && chatType === 'group' && (
            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedUsers.length < 2 || loading}
              className={`min-h-12 flex-1 rounded-lg px-4 py-2 transition ${
                groupName.trim() && selectedUsers.length >= 2 && !loading
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 cursor-pointer'
                  : 'bg-white/20 text-white/50 cursor-not-allowed'
              }`}
            >
              {loading ? t.createLoading : t.createConversation}
            </button>
          )}
          
          {step === 'details' && chatType === 'channel' && (
            <button
              onClick={handleCreateChannel}
              disabled={!channelName.trim() || loading}
              className={`min-h-12 flex-1 rounded-lg px-4 py-2 transition ${
                channelName.trim() && !loading
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 cursor-pointer'
                  : 'bg-white/20 text-white/50 cursor-not-allowed'
              }`}
            >
              {loading ? t.createLoading : t.createChannel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
