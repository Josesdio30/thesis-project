'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Reply, Plus, Paperclip, Send, RefreshCw, User } from 'lucide-react';
import { FaChevronDown } from 'react-icons/fa';
import { useAuth } from '@/lib/hooks/useAuth';
import { cn } from '@/lib/utils';

interface ForumPost {
  id: number;
  title: string;
  content: string;
  content_type: string;
  created_at: string;
  updated_at: string;
  author: {
    id: number;
    nama_lengkap: string;
    profile_picture_url?: string;
  };
  reply_count: number;
  attachments: Array<{
    id: number;
    file_name: string;
    file_url: string;
    file_size: number;
  }>;
}

interface ForumReply {
  id: number;
  content: string;
  content_type: string;
  created_at: string;
  updated_at: string;
  author: {
    id: number;
    nama_lengkap: string;
    profile_picture_url?: string;
  };
  parent_reply_id?: number;
  attachments: Array<{
    id: number;
    file_name: string;
    file_url: string;
    file_size: number;
  }>;
  nested_replies: Array<{
    id: number;
    content: string;
    content_type: string;
    created_at: string;
    author: {
      id: number;
      nama_lengkap: string;
      profile_picture_url?: string;
    };
  }>;
}

interface SessionData {
  id: number;
  session_number: number;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
}

interface ForumProps {
  courseCode?: string;
  sessions?: SessionData[];
}

const ForumSessionSelector = ({
  sessions,
  activeSession,
  setActiveSession,
}: {
  sessions: SessionData[];
  activeSession: number | null;
  setActiveSession: (id: number) => void;
}) => {
  const [visibleSessions, setVisibleSessions] = useState<SessionData[]>([]);
  const [hiddenSessions, setHiddenSessions] = useState<SessionData[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calculateVisibleSessions = () => {
      if (!containerRef.current || sessions.length === 0) {
        setVisibleSessions([]);
        setHiddenSessions([]);
        return;
      }
      const containerWidth = containerRef.current.offsetWidth;
      const buttonWidth = 140;
      const dropdownButtonWidth = 60;
      const maxVisibleButtons = Math.floor((containerWidth - dropdownButtonWidth) / buttonWidth);

      if (maxVisibleButtons >= sessions.length) {
        setVisibleSessions(sessions);
        setHiddenSessions([]);
      } else {
        // Always show first few sessions and keep active session visible
        let visible = sessions.slice(0, Math.max(1, maxVisibleButtons));

        // If active session is not in visible list, replace the last visible with active
        if (activeSession && !visible.some(s => s.id === activeSession)) {
          const activeSessionData = sessions.find(s => s.id === activeSession);
          if (activeSessionData && maxVisibleButtons > 0) {
            visible[maxVisibleButtons - 1] = activeSessionData;
          }
        }

        const hidden = sessions.filter(s => !visible.includes(s));
        setVisibleSessions(visible);
        setHiddenSessions(hidden);
      }
    };

    calculateVisibleSessions();

    const handleResize = () => calculateVisibleSessions();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sessions, activeSession]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="mb-4" ref={containerRef}>
      <div className="flex items-center gap-3 flex-wrap" style={{ minHeight: '48px' }}>
        {/* <span className="text-sm text-gray-600 font-medium">Session:</span> */}
        {/* Visible session buttons */}
        {visibleSessions.map(session => (
          <button
            key={session.id}
            onClick={() => {
              // console.log('=== FORUM SESSION CLICK ===');
              // console.log('Clicked session ID:', session.id);
              // console.log('Clicked session number:', session.session_number);
              // console.log('Current session before click:', activeSession);
              setActiveSession(session.id);
              // console.log('setActiveSession called with:', session.id);
              // console.log('===========================');
            }}
            className={cn(
              'px-4 py-2 rounded-lg border transition-all duration-200 whitespace-nowrap flex-shrink-0',
              activeSession === session.id
                ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300'
            )}
          >
            Session {session.session_number}
          </button>
        ))}

        {/* Dropdown for hidden sessions */}
        {hiddenSessions.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={cn(
                'px-3 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2',
                dropdownOpen
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              )}
            >
              {' '}
              <span>+{hiddenSessions.length}</span>
              <FaChevronDown
                className={cn('text-xs transition-transform duration-200', dropdownOpen && 'rotate-180')}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] max-h-[300px] overflow-y-auto">
                {hiddenSessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => {
                      console.log('=== FORUM DROPDOWN SESSION CLICK ===');
                      console.log('Clicked dropdown session ID:', session.id);
                      console.log('Clicked dropdown session number:', session.session_number);
                      console.log('Current session before click:', activeSession);
                      setActiveSession(session.id);
                      setDropdownOpen(false);
                      console.log('setActiveSession called with:', session.id);
                      console.log('===================================');
                    }}
                    className={cn(
                      'w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0',
                      activeSession === session.id && 'bg-blue-50 text-blue-700'
                    )}
                  >
                    Session {session.session_number}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Forum = ({ courseCode, sessions }: ForumProps) => {
  const { user, isAuthenticated } = useAuth();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [forum, setForum] = useState<{ id: number; title: string; description?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // Internal session management - simplified initialization
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(() => {
    // Use first available session
    if (sessions && sessions.length > 0) {
      console.log('Forum initializing with first session:', sessions[0].id);
      return sessions[0].id;
    }
    console.log('Forum initializing with null session');
    return null;
  });
  // Wrap setCurrentSessionId to add debugging
  const setCurrentSessionIdWithDebug = useCallback(
    (newSessionId: number) => {
      // console.log('=== FORUM SESSION CHANGE ===');
      // console.log('Previous session ID:', currentSessionId);
      // console.log('New session ID:', newSessionId);
      // console.log('============================');
      setCurrentSessionId(newSessionId);
    },
    [currentSessionId]
  );

  // Debug session changes
  // useEffect(() => {
  //   console.log('=== FORUM SESSION DEBUG ===');
  //   console.log('Current Session ID:', currentSessionId);
  //   console.log(
  //     'Available Sessions:',
  //     sessions?.map(s => ({ id: s.id, number: s.session_number }))
  //   );
  //   console.log('===========================');
  // }, [currentSessionId, sessions]);

  // Form states
  const [showNewPostForm, setShowNewPostForm] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newReplyContent, setNewReplyContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  // File attachment states
  const [postAttachments, setPostAttachments] = useState<File[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // File input refs
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null); // Upload file and return file info
  const uploadFile = async (
    file: File
  ): Promise<{ id: number; file_name: string; file_url: string; file_size: number } | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('courseCode', courseCode || '');
      formData.append('sessionId', currentSessionId?.toString() || '');
      formData.append('context', 'forum'); // Add forum context for organized file structure

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const uploadResult = await uploadResponse.json();

      // Return file info in the format expected by forum attachments
      return {
        id: Date.now(), // Temporary ID
        file_name: file.name,
        file_url: uploadResult.data.url,
        file_size: file.size,
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  };

  // Handle file selection for posts
  const handlePostFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setPostAttachments(prev => [...prev, ...Array.from(files)]);
    }
  };

  // Handle file selection for replies
  const handleReplyFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setReplyAttachments(prev => [...prev, ...Array.from(files)]);
    }
  };

  // Remove file from post attachments
  const removePostAttachment = (index: number) => {
    setPostAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Remove file from reply attachments
  const removeReplyAttachment = (index: number) => {
    setReplyAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }; // Fetch forum and posts
  const fetchForum = useCallback(async () => {
    if (!courseCode || !currentSessionId) {
      console.log('Skipping fetchForum - missing courseCode or currentSessionId:', { courseCode, currentSessionId });
      return;
    }

    // console.log('=== FETCHING FORUM ===');
    // console.log('Course Code:', courseCode);
    // console.log('Current Session ID:', currentSessionId);
    // console.log('======================');

    try {
      setLoading(true);
      setError(null);

      // Get forum info
      const forumResponse = await fetch(`/api/courses/${courseCode}/forums?sessionId=${currentSessionId}`);
      const forumResult = await forumResponse.json();

      // console.log('Forum API Response:', forumResult);

      if (forumResult.success) {
        setForum(forumResult.data.forum);

        // Get posts for this forum
        const postsResponse = await fetch(`/api/courses/${courseCode}/forums/${forumResult.data.forum.id}/posts`);
        const postsResult = await postsResponse.json();

        // console.log('Posts API Response:', postsResult);

        if (postsResult.success) {
          setPosts(postsResult.data.posts || []);
        } else {
          setError(postsResult.message || 'Failed to load forum posts');
        }
      } else {
        setError(forumResult.message || 'Failed to load forum');
      }
    } catch (err) {
      console.error('Error fetching forum:', err);
      setError('Network error while loading forum');
    } finally {
      setLoading(false);
    }
  }, [courseCode, currentSessionId]);

  // Fetch replies for a post
  const fetchReplies = useCallback(
    async (postId: number) => {
      if (!courseCode || !forum) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/courses/${courseCode}/forums/${forum.id}/posts/${postId}/replies`);
        const result = await response.json();

        if (result.success) {
          setReplies(result.data.replies || []);
        } else {
          setError(result.message || 'Failed to load replies');
        }
      } catch (err) {
        console.error('Error fetching replies:', err);
        setError('Network error while loading replies');
      } finally {
        setLoading(false);
      }
    },
    [courseCode, forum]
  ); // Create new post
  const handleCreatePost = async () => {
    if (!courseCode || !forum || !newPostTitle.trim() || !newPostContent.trim() || !user?.id) return;

    try {
      setLoading(true);
      setUploading(true);

      // Upload attachments first
      const uploadedAttachments = [];
      for (const file of postAttachments) {
        const uploadedFile = await uploadFile(file);
        if (uploadedFile) {
          uploadedAttachments.push(uploadedFile);
        }
      }

      const response = await fetch(`/api/courses/${courseCode}/forums/${forum.id}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newPostTitle,
          content: newPostContent,
          attachments: uploadedAttachments,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setPosts(prev => [result.data.post, ...prev]);
        setNewPostTitle('');
        setNewPostContent('');
        setPostAttachments([]);
        setShowNewPostForm(false);
      } else {
        setError(result.message || 'Failed to create post');
      }
    } catch (err) {
      console.error('Error creating post:', err);
      setError('Network error while creating post');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  }; // Create new reply
  const handleCreateReply = async (postId: number) => {
    if (!courseCode || !forum || !newReplyContent.trim() || !user?.id) return;

    try {
      setLoading(true);
      setUploading(true);

      // Upload attachments first
      const uploadedAttachments = [];
      for (const file of replyAttachments) {
        const uploadedFile = await uploadFile(file);
        if (uploadedFile) {
          uploadedAttachments.push(uploadedFile);
        }
      }

      const response = await fetch(`/api/courses/${courseCode}/forums/${forum.id}/posts/${postId}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newReplyContent,
          parent_reply_id: replyingTo,
          attachments: uploadedAttachments,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setReplies(prev => [...prev, result.data.reply]);
        setNewReplyContent('');
        setReplyAttachments([]);
        setReplyingTo(null);

        // Update reply count in posts
        setPosts(prev =>
          prev.map(post => (post.id === postId ? { ...post, reply_count: post.reply_count + 1 } : post))
        );
      } else {
        setError(result.message || 'Failed to create reply');
      }
    } catch (err) {
      console.error('Error creating reply:', err);
      setError('Network error while creating reply');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  }; // Load forum on mount and when session changes
  useEffect(() => {
    fetchForum();
  }, [fetchForum]);

  // Clear posts and selected post when session changes
  useEffect(() => {
    setPosts([]);
    setSelectedPost(null);
    setReplies([]);
  }, [currentSessionId]);

  // Load replies when post is selected
  useEffect(() => {
    if (selectedPost) {
      fetchReplies(selectedPost.id);
    }
  }, [selectedPost, fetchReplies]);

  // Show authentication message if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-[calc(100vh-200px)] bg-gray-50 rounded-lg shadow-sm border border-gray-300">
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <MessageSquare size={48} className="mx-auto mb-2 text-gray-400" />
            <p>Please log in to participate in forum discussions</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {/* Forum Session Selector - only show if sessions are provided */}
      {sessions && sessions.length > 1 && (
        <ForumSessionSelector
          sessions={sessions}
          activeSession={currentSessionId}
          setActiveSession={setCurrentSessionIdWithDebug}
        />
      )}

      <div className="flex flex-col h-[calc(100vh-200px)] bg-gray-50 rounded-lg shadow-sm border border-gray-300">
        {/* Header */}{' '}
        <div className="flex items-center justify-between p-4 border-b border-gray-300 bg-white rounded-t-lg">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <MessageSquare size={20} />
              {forum?.title || 'Forum Discussion'}
              {sessions && currentSessionId && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  - Session {sessions.find(s => s.id === currentSessionId)?.session_number}
                </span>
              )}
            </h2>
            {forum?.description && <p className="text-sm text-gray-600">{forum.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewPostForm(!showNewPostForm)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              <Plus size={16} />
              New Post
            </button>
            <button
              onClick={fetchForum}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1 rounded text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
        {/* Error message */}
        {error && (
          <div className="mx-4 mt-4 bg-red-50 border-l-4 border-red-400 p-3 rounded">
            <div className="text-sm text-red-700">
              <strong>Error:</strong> {error}
            </div>
          </div>
        )}
        {/* New Post Form */}
        {showNewPostForm && (
          <div className="m-4 p-4 bg-white border border-gray-300 rounded-lg">
            <h3 className="text-md font-semibold text-gray-800 mb-3">Create New Post</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newPostTitle}
                onChange={e => setNewPostTitle(e.target.value)}
                placeholder="Post title..."
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />{' '}
              <textarea
                value={newPostContent}
                onChange={e => setNewPostContent(e.target.value)}
                placeholder="Write your post content..."
                rows={4}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {/* File attachments preview */}
              {postAttachments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">Attachments:</h4>
                  {postAttachments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded border">
                      <div className="flex items-center gap-2">
                        <Paperclip size={14} className="text-gray-500" />
                        <span className="text-sm text-gray-700">{file.name}</span>
                        <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
                      </div>
                      <button
                        onClick={() => removePostAttachment(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={postFileInputRef}
                    onChange={handlePostFileSelect}
                    multiple
                    className="hidden"
                    accept="*/*"
                  />
                  <button
                    type="button"
                    onClick={() => postFileInputRef.current?.click()}
                    className="flex items-center gap-2 text-gray-600 hover:text-blue-500"
                  >
                    <Paperclip size={16} />
                    Attach File
                  </button>
                  {uploading && <span className="text-sm text-blue-600">Uploading files...</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowNewPostForm(false)}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>{' '}
                  <button
                    onClick={handleCreatePost}
                    disabled={loading || !newPostTitle.trim() || !newPostContent.trim() || !user?.id}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={16} />
                    Post
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-1 overflow-hidden">
          {/* Posts List */}
          <div className="w-1/2 border-r border-gray-300 flex flex-col">
            <div className="p-3 bg-gray-100 border-b border-gray-300">
              <h3 className="font-medium text-gray-700">Posts ({posts.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && posts.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
                    <p className="text-gray-600">Loading posts...</p>
                  </div>
                </div>
              ) : posts.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <MessageSquare size={48} className="mx-auto mb-2 text-gray-400" />
                  <p>No posts yet. Be the first to start a discussion!</p>
                </div>
              ) : (
                posts.map(post => (
                  <div
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedPost?.id === post.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    <h4 className="font-medium text-gray-800 mb-1">{post.title}</h4>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">{post.content}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center gap-2">
                        <User size={12} />
                        <span>{post.author.nama_lengkap}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Reply size={12} />
                          {post.reply_count}
                        </span>
                        <span>{formatTimestamp(post.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Post Detail & Replies */}
          <div className="w-1/2 flex flex-col">
            {selectedPost ? (
              <>
                {/* Post Detail */}
                <div className="p-4 border-b border-gray-300 bg-white">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">{selectedPost.title}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    <User size={14} />
                    <span>{selectedPost.author.nama_lengkap}</span>
                    <span>•</span>
                    <span>{formatTimestamp(selectedPost.created_at)}</span>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-gray-700">{selectedPost.content}</p>
                  </div>
                  {selectedPost.attachments.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Attachments:</h4>
                      {selectedPost.attachments.map(attachment => (
                        <a
                          key={attachment.id}
                          href={attachment.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <Paperclip size={12} />
                          {attachment.file_name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                {/* Replies */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-3 bg-gray-100 border-b border-gray-300">
                    <h4 className="font-medium text-gray-700">Replies ({replies.length})</h4>
                  </div>

                  {replies.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      <p>No replies yet. Be the first to reply!</p>
                    </div>
                  ) : (
                    <div className="space-y-4 p-4">
                      {replies.map(reply => (
                        <div key={reply.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                            <User size={12} />
                            <span className="font-medium">{reply.author.nama_lengkap}</span>
                            <span>•</span>
                            <span>{formatTimestamp(reply.created_at)}</span>
                          </div>
                          <p className="text-gray-700 mb-2">{reply.content}</p>
                          {reply.attachments.length > 0 && (
                            <div className="mb-2">
                              {reply.attachments.map(attachment => (
                                <a
                                  key={attachment.id}
                                  href={attachment.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                                >
                                  <Paperclip size={10} />
                                  {attachment.file_name}
                                </a>
                              ))}
                            </div>
                          )}
                          {reply.nested_replies.length > 0 && (
                            <div className="ml-4 mt-3 space-y-2">
                              {reply.nested_replies.map(nestedReply => (
                                <div key={nestedReply.id} className="bg-white rounded p-2 text-sm">
                                  <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                                    <User size={10} />
                                    <span className="font-medium">{nestedReply.author.nama_lengkap}</span>
                                    <span>•</span>
                                    <span>{formatTimestamp(nestedReply.created_at)}</span>
                                  </div>
                                  <p className="text-gray-700">{nestedReply.content}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>{' '}
                {/* Reply Form */}
                <div className="p-4 bg-white border-t border-gray-300">
                  {/* Reply attachments preview */}
                  {replyAttachments.length > 0 && (
                    <div className="mb-3 space-y-2">
                      <h4 className="text-sm font-medium text-gray-700">Attachments:</h4>
                      {replyAttachments.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded border">
                          <div className="flex items-center gap-2">
                            <Paperclip size={14} className="text-gray-500" />
                            <span className="text-sm text-gray-700">{file.name}</span>
                            <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
                          </div>
                          <button
                            onClick={() => removeReplyAttachment(index)}
                            className="text-red-500 hover:text-red-700 text-sm"
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      ref={replyFileInputRef}
                      onChange={handleReplyFileSelect}
                      multiple
                      className="hidden"
                      accept="*/*"
                    />
                    <button
                      type="button"
                      onClick={() => replyFileInputRef.current?.click()}
                      className="text-gray-600 hover:text-blue-500"
                    >
                      <Paperclip size={16} />
                    </button>
                    <textarea
                      value={newReplyContent}
                      onChange={e => setNewReplyContent(e.target.value)}
                      placeholder="Write a reply..."
                      rows={2}
                      className="flex-1 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <button
                      onClick={() => handleCreateReply(selectedPost.id)}
                      disabled={loading || !newReplyContent.trim() || !user?.id || uploading}
                      className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send size={16} />
                    </button>
                  </div>

                  {uploading && (
                    <div className="mt-2 text-center">
                      <span className="text-sm text-blue-600">Uploading files...</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <MessageSquare size={48} className="mx-auto mb-2 text-gray-400" />
                  <p>Select a post to view discussion</p>
                </div>
              </div>
            )}{' '}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Forum;
