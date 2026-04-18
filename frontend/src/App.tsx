import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Admin from './pages/Admin'
import DeleteAccount from './pages/DeleteAccount'
import ForgotPassword from './pages/ForgotPassword'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import SavedSearches from './pages/SavedSearches'
import Search from './pages/Search'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/search" element={<Search />} />
        <Route path="/saved-searches" element={<SavedSearches />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/delete-account" element={<DeleteAccount />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
