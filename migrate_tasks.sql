-- 1. 查看当前的用户信息 (获取你的 user_key)
SELECT username, user_key, created_at FROM users;

-- 2. 查看当前的提醒任务归属 (查看之前的任务属于哪个 key)
SELECT id, title, user_key, created_at FROM reminders ORDER BY created_at DESC LIMIT 5;

-- 3. 数据迁移：将所有旧任务迁移给新用户
-- ⚠️ 把下面的 'new_user_key_from_step_1' 替换为第一步查到的 user_key
-- ⚠️ 把下面的 'old_user_key_from_step_2' 替换为第二步查到的旧 user_key
-- 或者如果你确定要把所有任务都给当前用户，可以直接运行：

-- UPDATE reminders 
-- SET user_key = (SELECT user_key FROM users WHERE username = 'YOUR_USERNAME' LIMIT 1)
-- WHERE user_key != (SELECT user_key FROM users WHERE username = 'YOUR_USERNAME' LIMIT 1);
