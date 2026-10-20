import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'node:fs';

const token = fs.readFileSync('D:/User_Data/Desktop/重庆大学3D项目/cqu-3d/tmp/.token', 'utf8').trim();
const dir = process.cwd();
const res = await git.push({ fs, http, dir, remote: 'origin', ref: 'main', onAuth: () => ({ username: 'x-access-token', password: token }) });
console.log('push', JSON.stringify(res.refs));
