import api from './axios';

export const listLocations   = ()             => api.get('/locations');
export const createLocation  = (payload)      => api.post('/locations', payload);
export const updateLocation  = (id, payload)  => api.patch(`/locations/${id}`, payload);
export const deleteLocation  = (id)           => api.delete(`/locations/${id}`);
