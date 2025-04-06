import { getApiClient, makeRequest } from '../client';

// Mock fetch globally
global.fetch = jest.fn();

describe('API Client', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  it('should create API client with correct base URL', () => {
    const client = getApiClient();
    expect(client).toBeDefined();
  });

  it('should make successful GET requests', async () => {
    // Mock a successful response
    const mockResponse = { data: { message: 'success' } };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    const result = await makeRequest('GET', '/test-endpoint');
    
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockResponse);
  });

  it('should make successful POST requests with data', async () => {
    // Mock a successful response
    const mockResponse = { data: { message: 'created' } };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    const postData = { name: 'Test', value: 123 };
    const result = await makeRequest('POST', '/test-endpoint', postData);
    
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify(postData));
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(result).toEqual(mockResponse);
  });

  it('should handle error responses', async () => {
    // Mock an error response
    const errorResponse = { error: 'Not found' };
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: jest.fn().mockResolvedValueOnce(errorResponse)
    });

    await expect(makeRequest('GET', '/non-existent')).rejects.toThrow('Request failed: 404 Not Found');
  });

  it('should handle network errors', async () => {
    // Mock a network error
    fetch.mockRejectedValueOnce(new Error('Network failure'));

    await expect(makeRequest('GET', '/test-endpoint')).rejects.toThrow('Network failure');
  });
});