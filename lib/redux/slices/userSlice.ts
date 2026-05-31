import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import type { User } from "./../../../src/types/user";
import { fetchWithAuth } from "../../api";

interface UserState {
  user: User | null;
  loading: boolean;
}

const initialState: UserState = {
  user: null,
  loading: true,
};

export const fetchMe = createAsyncThunk(
  'user/fetchMe',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetchWithAuth('/auth/me');
      if (!response.ok) {
        throw new Error('Not authenticated');
      }
      const data = await response.json();
      return data as User;
    } catch (error) {
      return rejectWithValue(null);
    }
  }
);

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      state.loading = false;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.loading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMe.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
        state.loading = false;
      })
      .addCase(fetchMe.rejected, (state) => {
        state.user = null;
        state.loading = false;
      });
  },
});

export const { setUser, setLoading, logout } = userSlice.actions;
export default userSlice.reducer;