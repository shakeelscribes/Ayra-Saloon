import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token on every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('ayra_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-logout on 401
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ayra_token')
      localStorage.removeItem('ayra_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
