// api/index.js - API 라우트 통합 및 정리
// 리팩토링된 API 엔드포인트 관리

import fluxTransferHandler from './flux-transfer-refactored.js';
import checkPredictionHandler from './check-prediction.js';
import generateEducationHandler from './generate-education.js';

// API 라우트 맵핑
export const routes = {
  '/api/flux-transfer': fluxTransferHandler,
  '/api/check-prediction': checkPredictionHandler,
  '/api/generate-education': generateEducationHandler,
};

// Vercel 서버리스 함수용 기본 핸들러
export default function handler(req, res) {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  
  const routeHandler = routes[pathname];
  
  if (routeHandler) {
    return routeHandler(req, res);
  }
  
  // 404 처리
  res.status(404).json({ 
    error: 'API endpoint not found',
    available: Object.keys(routes)
  });
}

// 개발 환경용 로깅 미들웨어
export function withLogging(handler) {
  return async (req, res) => {
    const start = Date.now();
    console.log(`[API] ${req.method} ${req.url}`);
    
    try {
      await handler(req, res);
    } finally {
      const duration = Date.now() - start;
      console.log(`[API] Completed in ${duration}ms`);
    }
  };
}

// CORS 미들웨어
export function withCORS(handler) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    return handler(req, res);
  };
}

// 에러 핸들링 미들웨어
export function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('[API Error]', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  };
}
