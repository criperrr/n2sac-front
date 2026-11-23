import React from 'react';
import {
  BookOpen,
  Users,
  Sigma,
  Atom,
  FlaskConical,
  Dna,
  Landmark,
  Globe,
  Brain,
  Languages,
  Code2,
  Database,
  Cpu,
  Wrench,
  Briefcase,
  GitBranch,
  Dumbbell,
  Palette,
  AppWindow,
} from 'lucide-react';

export function stripAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Adaptive, keyword-based subject icon resolver covering standard Brazilian high school
 * and CTI technical courses (Informática, Eletrônica, Mecânica), with safe fallback to BookOpen.
 */
export function renderSubjectIcon(subjectName: string, size = 19): React.ReactNode {
  const n = stripAccents(subjectName);
  if (n.includes('matemat') || n.includes('calculo') || n.includes('estatist')) {
    return <Sigma size={size} />;
  }
  if (n.includes('fisic') && !n.includes('educacao')) {
    return <Atom size={size} />;
  }
  if (n.includes('quimic')) {
    return <FlaskConical size={size} />;
  }
  if (n.includes('biolog')) {
    return <Dna size={size} />;
  }
  if (n.includes('histor')) {
    return <Landmark size={size} />;
  }
  if (n.includes('geograf')) {
    return <Globe size={size} />;
  }
  if (n.includes('filosof')) {
    return <Brain size={size} />;
  }
  if (n.includes('sociolog')) {
    return <Users size={size} />;
  }
  if (n.includes('ingles') || n.includes('espanhol') || n.includes('idioma')) {
    return <Languages size={size} />;
  }
  if (n.includes('educacao fisica') || n.includes('ed. fisica')) {
    return <Dumbbell size={size} />;
  }
  if (n.includes('arte')) {
    return <Palette size={size} />;
  }
  if (n.includes('banco de dados') || n.includes('sql')) {
    return <Database size={size} />;
  }
  if (n.includes('analise') || n.includes('projeto de sistemas') || n.includes('engenharia de software')) {
    return <GitBranch size={size} />;
  }
  if (n.includes('aplicativo') || n.includes('interface') || n.includes('web')) {
    return <AppWindow size={size} />;
  }
  if (
    n.includes('programac') ||
    n.includes('algoritm') ||
    n.includes('java') ||
    n.includes('php') ||
    n.includes('c#') ||
    n.includes('python') ||
    n.includes('redes') ||
    n.includes('sistemas operacionais')
  ) {
    return <Code2 size={size} />;
  }
  if (n.includes('eletron') || n.includes('eletric') || n.includes('microcontrol') || n.includes('circuito')) {
    return <Cpu size={size} />;
  }
  if (n.includes('mecan') || n.includes('usinag') || n.includes('desenho') || n.includes('cnc')) {
    return <Wrench size={size} />;
  }
  if (n.includes('gestao') || n.includes('negocio') || n.includes('empreend') || n.includes('administ')) {
    return <Briefcase size={size} />;
  }
  return <BookOpen size={size} />;
}
