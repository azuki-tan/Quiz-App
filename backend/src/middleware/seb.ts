import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function verifySafeExamBrowser(req: Request, res: Response, next: NextFunction) {
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  
  // Check if it's Safe Exam Browser by looking for 'safeexambrowser' or 'seb/' in User-Agent,
  // or by verifying the presence of SEB custom headers.
  const hasSebHeader = !!req.headers['x-safeexambrowser-requesthash'] || 
                       !!req.headers['x-safeexambrowser-configkeyhash'];
  
  const isSebAgent = userAgent.includes('safeexambrowser') || userAgent.includes('seb/');

  if (!isSebAgent && !hasSebHeader) {
    return res.status(403).json({
      error: 'ACCESS_DENIED',
      message: 'Bạn bắt buộc phải sử dụng Safe Exam Browser để truy cập bài thi này.',
      debug: {
        userAgent: req.headers['user-agent'],
        headersReceived: Object.keys(req.headers)
      }
    });
  }

  next();
}
