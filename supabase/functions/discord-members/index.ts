import { createClient } from 'npm:@supabase/supabase-js@2'

const CHANNEL_ID = '1537978516812079174'
const DISCORD_API = 'https://discord.com/api/v10'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function clean(v: unknown) {
  return String(v ?? '').replace(/[`*_~]/g, '').trim()
}

function parseMessage(content: string, author: any) {
  const text = String(content || '').replace(/\r/g, '')
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean)

  const pick = (patterns: RegExp[]) => {
    for (const line of lines) {
      for (const p of patterns) {
        const m = line.match(p)
        if (m) return clean(m[1])
      }
    }
    return ''
  }

  let name = pick([
    /^(?:tên(?: nhân vật)?|name|nhân vật)\s*[:：=-]\s*(.+)$/i
  ])

  let uid = pick([
    /^(?:uid|id)\s*[:：=-]\s*(\d{5,30})$/i
  ])

  let role = pick([
    /^(?:vai trò|vai tro|role|class)\s*[:：=-]\s*(.+)$/i
  ])

  let time = pick([
    /^(?:khung giờ|khung gio|giờ|gio|time)\s*[:：=-]\s*(.+)$/i
  ])

  if ((!name || !uid || !role || !time) && text.includes('|')) {
    for (const part of text.split('|')) {
      const m = part.trim().match(/^([^:：]+)\s*[:：]\s*(.+)$/)
      if (!m) continue

      const key = m[1].trim().toLowerCase()
      const value = clean(m[2])

      if (!name && /^(tên|ten|tên nhân vật|ten nhan vat|name|nhân vật|nhan vat)$/.test(key)) {
        name = value
      }

      if (!uid && /^(uid|id)$/.test(key) && /^\d{5,30}$/.test(value)) {
        uid = value
      }

      if (!role && /^(vai trò|vai tro|role|class)$/.test(key)) {
        role = value
      }

      if (!time && /^(khung giờ|khung gio|giờ|gio|time)$/.test(key)) {
        time = value
      }
    }
  }

  const authorName = clean(author?.global_name || author?.username || '')

  if (!name) name = authorName
  if (!uid && author?.id) uid = String(author.id)

  // Bỏ qua bot/system nếu không có trường Tên rõ ràng trong nội dung.
  if (
    (author?.bot || author?.system) &&
    !pick([/^(?:tên(?: nhân vật)?|name|nhân vật)\s*[:：=-]\s*(.+)$/i])
  ) {
    return null
  }

  const times = time
    ? (
        time.toUpperCase().includes('FULL')
          ? ['FULL KHUNG GIỜ']
          : time.split(/[,;/|]+/).map(clean).filter(Boolean)
      )
    : []

  return {
    name,
    uid,
    role: role || 'Flex',
    time: times.join(', '),
    times,
    discordUserId: author?.id ? String(author.id) : '',
    username: author?.username || '',
    discordChannelId: CHANNEL_ID,
  }
}

async function discordFetch(path: string, token: string) {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: {
      Authorization: `Bot ${token}`,
      'User-Agent': 'ThienNam-Supabase-Discord-Sync/1.0',
    },
  })

  const body = await response.text()

  if (!response.ok) {
    throw new Error(
      `Discord API ${response.status}: ${body.slice(0, 500)}`
    )
  }

  return body ? JSON.parse(body) : null
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return json(
      { ok: false, error: 'Method Not Allowed' },
      405
    )
  }

  const discordToken = Deno.env.get('DISCORD_BOT_TOKEN')

  if (!discordToken) {
    return json(
      {
        ok: false,
        error: 'Thiếu DISCORD_BOT_TOKEN trong Supabase Secrets.',
      },
      500
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      {
        ok: false,
        error: 'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong Edge Function.',
      },
      500
    )
  }

  const supabaseAdmin = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  const url = new URL(req.url)
  const requestedChannel =
    url.searchParams.get('channel_id') || CHANNEL_ID

  if (requestedChannel !== CHANNEL_ID) {
    return json(
      {
        ok: false,
        error: 'Channel ID không hợp lệ.',
      },
      400
    )
  }

  const requestedLimit = Number(
    url.searchParams.get('limit') || 100
  )

  const limit = Math.min(
    Math.max(
      Number.isFinite(requestedLimit) ? requestedLimit : 100,
      1
    ),
    100
  )

  try {
    // Lấy tin nhắn từ Discord bằng Bot Token.
    const messages = await discordFetch(
      `/channels/${CHANNEL_ID}/messages?limit=${limit}`,
      discordToken
    )

    const byKey = new Map<string, any>()

    for (const message of messages) {
      if (!message?.author) continue

      const item = parseMessage(
        message.content,
        message.author
      )

      if (!item || !item.name) continue

      const key =
        item.uid ||
        item.discordUserId ||
        item.name.toLowerCase()

      const previous = byKey.get(key)

      byKey.set(key, {
        ...(previous || {}),
        ...item,
        messageId: message.id,
        createdAt:
          message.timestamp ||
          previous?.createdAt ||
          null,
        rawContent: message.content || '',
      })
    }

    const members = [...byKey.values()]

    const rows = members.map((m) => ({
      channel_id: CHANNEL_ID,
      message_id: m.messageId,
      discord_user_id: m.discordUserId || null,
      username: m.username || null,
      name: m.name,
      uid: m.uid || null,
      role: m.role || 'Flex',
      times: Array.isArray(m.times) ? m.times : [],
      raw_content: m.rawContent || null,
      message_created_at: m.createdAt,
      updated_at: new Date().toISOString(),
    }))

    if (rows.length) {
      const { error } = await supabaseAdmin
        .from('tn_discord_members')
        .upsert(
          rows,
          {
            onConflict: 'channel_id,discord_user_id',
          }
        )

      if (error) {
        throw new Error(
          `Supabase upsert failed: ${error.message}`
        )
      }
    }

    return json({
      ok: true,
      channel_id: CHANNEL_ID,
      count: members.length,
      fetched_messages: messages.length,
      synced_at: new Date().toISOString(),
      members,
    })
  } catch (error) {
    console.error('discord-members error:', error)

    return json(
      {
        ok: false,
        error: 'Discord/Supabase đồng bộ thất bại.',
        detail:
          error instanceof Error
            ? error.message
            : String(error),
      },
      502
    )
  }
})
