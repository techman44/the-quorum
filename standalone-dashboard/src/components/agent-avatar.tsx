"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getAgent } from "@/lib/agents";

interface AgentAvatarProps {
  agentName: string;
  size?: "sm" | "default" | "lg";
}

export function AgentAvatar({ agentName, size = "default" }: AgentAvatarProps) {
  const agent = getAgent(agentName);
  const letter = (agent?.displayName ?? agentName).charAt(0).toUpperCase();
  const color = agent?.color ?? "#71717a";

  return (
    <Avatar size={size}>
      <AvatarImage
        src={`/avatars/${agentName}.png`}
        alt={agent?.displayName ?? agentName}
      />
      <AvatarFallback
        style={{ backgroundColor: color, color: "#fff" }}
        className="font-semibold"
      >
        {letter}
      </AvatarFallback>
    </Avatar>
  );
}
