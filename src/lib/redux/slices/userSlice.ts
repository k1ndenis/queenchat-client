import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import type { User } from "./../../../types/user.ts";
import { fetchWithAuth, bumpAvatarVersion, addVersionToAvatarUrl, getCurrentAvatarVersion } from "../../api";

interface UserState {
  user: User | null;
  loading: boolean;
  language: string;
  avatarVersion: string;
}

const savedLanguage = localStorage.getItem('queenchat_language');
const savedAvatarVersion = localStorage.getItem('avatar_version');

const initialState: UserState = {
  user: null,
  loading: true,
  language: savedLanguage === 'en' ? 'en' : 'ru',
  avatarVersion: savedAvatarVersion || Date.now().toString(),
};

export const fetchMe = createAsyncThunk(
  'user/fetchMe',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetchWithAuth('/auth/me');
      
      if (!response.ok) {
        return rejectWithValue({ unauthorized: response.status === 401 });
      }
      
      const data = await response.json();
      
      if (data.avatar) {
        const currentVersion = getCurrentAvatarVersion();
        data.avatar = addVersionToAvatarUrl(data.avatar);
      }
      
      return data as User;
    } catch (error) {
      return rejectWithValue({ unauthorized: false });
    }
  }
);

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User | null>) => {
      if (action.payload) {
        if (action.payload.avatar) {
          action.payload.avatar = addVersionToAvatarUrl(action.payload.avatar);
        }
      }
      state.user = action.payload;
      state.loading = false;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.loading = false;
      state.avatarVersion = Date.now().toString();
      localStorage.removeItem('avatar_version');
    },
    setLanguage: (state, action: PayloadAction<string>) => {
      state.language = action.payload;
      localStorage.setItem('queenchat_language', action.payload);
    },
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        if (action.payload.avatar) {
          const newVersion = bumpAvatarVersion();
          state.avatarVersion = newVersion;
          action.payload.avatar = addVersionToAvatarUrl(action.payload.avatar);
        }
        state.user = { ...state.user, ...action.payload };
        
      }
    },
    updateAvatarVersion: (state, action: PayloadAction<string>) => {
      state.avatarVersion = action.payload;
    },
    refreshAvatar: (state) => {
      if (state.user?.avatar) {
        const newVersion = bumpAvatarVersion();
        state.avatarVersion = newVersion;
        state.user.avatar = addVersionToAvatarUrl(state.user.avatar.split('?')[0]);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMe.pending, (state) => {
        if (!state.user) state.loading = true;
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
        state.loading = false;
      })
      .addCase(fetchMe.rejected, (state, action) => {
        // A cached session remains usable offline. Only an explicit 401 invalidates it.
        const unauthorized = (action.payload as { unauthorized?: boolean } | undefined)?.unauthorized;
        if (unauthorized || !state.user) state.user = null;
        state.loading = false;
      });
  },
});

export const { 
  setUser, 
  setLoading, 
  logout, 
  setLanguage, 
  updateUser,
  updateAvatarVersion,
  refreshAvatar 
} = userSlice.actions;

export default userSlice.reducer;
