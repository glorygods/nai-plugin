import plugin from '../../../lib/plugins/plugin.js';
import { pluginResources } from '../model/path.js'; // 复用原代码的路径配置，避免硬编码
import fs from 'fs';
import path from 'path';

export class CleanAiPic extends plugin {
    constructor() {
        super({
            name: 'nai-清理图片',
            dsc: '清理AI绘画插件生成的本地图片',
            event: 'message',
            priority: 1009,
            rule: [
                // 规则1：清理当前用户的图片（命令：/nai --clean）
                {
                    reg: '^[/#]nai --clean$',
                    fnc: 'cleanMyPic'
                },
                // 规则2：管理员清理所有用户的图片（命令：/nai --clean all）
                {
                    reg: '^[/#]nai --clean all$',
                    fnc: 'cleanAllPic'
                }
            ]
        });
    }

    /**
     * 清理当前发送命令用户的AI图片
     * @param {Object} e - 云崽消息事件对象
     */
    async cleanMyPic(e) {
        // 1. 处理用户ID（与原代码格式保持一致，替换特殊字符）
        const userId = e.user_id.toString().replace(/:/g, '-');
        // 2. 拼接当前用户的图片目录（指定路径：userPic/用户ID）
        const userPicDir = path.join(pluginResources, 'userPic', userId);

        // 3. 检查目录是否存在
        if (!fs.existsSync(userPicDir)) {
            return await e.reply('你当前没有生成过AI图片，无需清理～');
        }

        try {
            // 4. 读取目录下所有文件（为了统计数量，我们还是先滤出 .png）
            const picFiles = fs.readdirSync(userPicDir).filter(file => 
                path.extname(file).toLowerCase() === '.png'
            );

            if (picFiles.length === 0) {
                // 如果没有 png，但目录空着或者有杂物，顺手把它抹平
                fs.rmSync(userPicDir, { recursive: true, force: true });
                return await e.reply('你当前没有可清理的AI图片～');
            }

            // 5. 核心优化：直接使用 rmSync 递归强制删除整个用户文件夹，干净利落
            const deleteCount = picFiles.length;
            fs.rmSync(userPicDir, { recursive: true, force: true });

            // 6. 回复清理结果
            await e.reply(`✅ 已成功清理你的AI图片\n删除数量：${deleteCount} 张`);
            logger.mark(logger.blue('[NAI PLUGIN]'), logger.cyan(`用户 ${userId} 清理自身图片 ${deleteCount} 张`));

        } catch (error) {
            logger.error(logger.blue('[NAI PLUGIN]'), logger.red(`清理用户图片失败：`), error);
            await e.reply('❌ 图片清理失败，请查看控制台日志');
        }
    }

    /**
     * 管理员清理所有用户的AI图片（需权限验证）
     * @param {Object} e - 云崽消息事件对象
     */
    async cleanAllPic(e) {
        // 1. 权限验证：优先使用云崽最通用的 e.isMaster，兼容性最好
        if (!e.isMaster) {
            return await e.reply('❌ 仅主人可执行「清理所有用户图片」操作');
        }

        // 2. 拼接总图片目录（指定根路径：userPic）
        const allPicRootDir = path.join(pluginResources, 'userPic');

        // 3. 检查根目录是否存在
        if (!fs.existsSync(allPicRootDir)) {
            return await e.reply('当前没有任何用户生成过AI图片，无需清理～');
        }

        try {
            // 4. 遍历所有用户目录
            const userDirs = fs.readdirSync(allPicRootDir).filter(dir => 
                fs.statSync(path.join(allPicRootDir, dir)).isDirectory()
            );

            if (userDirs.length === 0) {
                return await e.reply('当前没有任何可清理的AI图片～');
            }

            // 5. 批量统计并轰炸式清理
            let totalDeleteCount = 0;
            userDirs.forEach(userDirName => {
                const userDirPath = path.join(allPicRootDir, userDirName);
                
                // 统计该用户目录下的 png 数量
                const picFiles = fs.readdirSync(userDirPath).filter(file => 
                    path.extname(file).toLowerCase() === '.png'
                );
                totalDeleteCount += picFiles.length;

                // 强制删除整个用户子目录（管他里面塞了 zip 还是 png，统统荡平）
                fs.rmSync(userDirPath, { recursive: true, force: true });
            });

            // 6. 回复清理结果
            await e.reply(`✅ 已成功清理所有用户AI图片\n总删除数量：${totalDeleteCount} 张\n涉及用户数：${userDirs.length} 个`);
            logger.mark(logger.blue('[NAI PLUGIN]'), logger.cyan(`管理员 ${e.user_id} 清理所有图片 ${totalDeleteCount} 张`));

        } catch (error) {
            logger.error(logger.blue('[NAI PLUGIN]'), logger.red(`清理所有图片失败：`), error);
            await e.reply('❌ 批量清理图片失败，请查看控制台日志');
        }
    }
}
