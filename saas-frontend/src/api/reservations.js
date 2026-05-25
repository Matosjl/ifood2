import api from './axios';

export const listReservations   = (params)     => api.get('/reservations', { params });
export const createReservation  = (data)       => api.post('/reservations', data);
export const updateReservation  = (id, data)   => api.patch(`/reservations/${id}`, data);
export const deleteReservation  = (id)         => api.delete(`/reservations/${id}`);
