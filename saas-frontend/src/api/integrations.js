import api from './axios';

// iFood
export const getIfoodConfig    = ()     => api.get('/integrations/ifood/config');
export const saveIfoodConfig   = (data) => api.put('/integrations/ifood/config', data);
export const disconnectIfood   = ()     => api.delete('/integrations/ifood/config');
export const syncIfoodNow      = ()     => api.post('/integrations/ifood/sync');
