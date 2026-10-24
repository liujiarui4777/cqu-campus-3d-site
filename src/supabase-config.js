/* 数据上报地址（Supabase 项目）
 *
 * 这两个值填上以后，学生在 3D 页面里登录、留言才会被记录到后台。
 * anon key 本来就是公开的（会出现在网页源码里），安全由数据库行级权限保证：
 * 匿名角色只能往 login_events / messages 里写，读不到任何数据。
 *
 * 留空 = 关闭上报（界面一切照旧，只是后台收不到记录）。
 */
export const TELEMETRY = {
  url: 'https://xsxkmesgonmruclbahmb.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzeGttZXNnb25tcnVjbGJhaG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4Mjg1NTgsImV4cCI6MjEwODQwNDU1OH0.m9Yz2fCwlvKtuJrYoCGtZ0vD1BqtplWlfLxnXrszRyY',
};
