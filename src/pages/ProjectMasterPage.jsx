import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const CUSTOM_PROJECTS_KEY = 'vseek_custom_projects';

function loadCustomProjects() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_PROJECTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function removeCustomProject(name) {
  const existing = loadCustomProjects();
  const filtered = existing.filter((projectName) => projectName !== name);
  localStorage.setItem(CUSTOM_PROJECTS_KEY, JSON.stringify(filtered));
}

export default function ProjectMasterPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectAssignments, setProjectAssignments] = useState([]);
  const [unrecognizedProjects, setUnrecognizedProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadEmployees() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, created_at')
      .eq('role', 'employee')
      .order('name', { ascending: true });

    if (error) {
      toast.error(error.message);
      return [];
    }

    return data || [];
  }

  async function loadProjectData() {
    const [projectRes, assignmentRes] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, is_active, created_at')
        .order('name', { ascending: true }),
      supabase
        .from('employee_project_assignments')
        .select('user_id, project_id, created_at')
    ]);

    if (projectRes.error) {
      toast.error(projectRes.error.message);
      return;
    }

    if (assignmentRes.error) {
      toast.error(assignmentRes.error.message);
      return;
    }

    setProjects(projectRes.data || []);
    setProjectAssignments(assignmentRes.data || []);

    const customProjects = loadCustomProjects();
    const officialProjectNames = new Set((projectRes.data || []).map((project) => project.name));
    setUnrecognizedProjects(customProjects.filter((name) => !officialProjectNames.has(name)));
  }

  async function refreshData() {
    setLoading(true);
    const [employeeList] = await Promise.all([loadEmployees(), loadProjectData()]);
    setEmployees(employeeList);
    setLoading(false);
  }

  useEffect(() => {
    void refreshData();
  }, []);

  const employeeNameById = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => {
      map.set(employee.id, employee.name);
    });
    return map;
  }, [employees]);

  const projectEmployeeMatrix = useMemo(() => {
    const grouped = new Map();

    projects.forEach((project) => {
      grouped.set(project.id, { project, employees: [] });
    });

    projectAssignments.forEach((assignment) => {
      const target = grouped.get(assignment.project_id);
      if (!target) return;
      const employeeName = employeeNameById.get(assignment.user_id);
      if (employeeName) target.employees.push(employeeName);
    });

    return Array.from(grouped.values())
      .map((row) => ({ ...row, employees: row.employees.sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.project.name.localeCompare(b.project.name));
  }, [projects, projectAssignments, employeeNameById]);

  async function addProject() {
    const name = String(newProjectName || '').trim();
    if (!name) {
      toast.error('Project name is required');
      return;
    }

    const { error } = await supabase
      .from('projects')
      .insert({ name, is_active: true, created_by: user?.id || null });

    if (error) {
      toast.error(error.message);
      return;
    }

    setNewProjectName('');
    toast.success('Project added');
    await loadProjectData();
  }

  async function updateProject(project) {
    const name = String(editingProjectName || '').trim();
    if (!name) {
      toast.error('Project name is required');
      return;
    }

    const { error } = await supabase
      .from('projects')
      .update({ name })
      .eq('id', project.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Project updated');
    setEditingProjectId(null);
    setEditingProjectName('');
    await loadProjectData();
  }

  async function toggleProjectActive(project) {
    const { error } = await supabase
      .from('projects')
      .update({ is_active: !project.is_active })
      .eq('id', project.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(project.is_active ? 'Project archived' : 'Project activated');
    await loadProjectData();
  }

  async function deleteProject(project) {
    const ok = window.confirm(`Delete project "${project.name}" permanently? This cannot be undone.`);
    if (!ok) return;

    const { error } = await supabase.from('projects').delete().eq('id', project.id);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Project deleted');
    await loadProjectData();
  }

  async function promoteProjectToOfficial(projectName) {
    const name = String(projectName || '').trim();
    if (!name) {
      toast.error('Project name is required');
      return;
    }

    const { error } = await supabase
      .from('projects')
      .insert({ name, is_active: true, created_by: user?.id || null });

    if (error) {
      toast.error(error.message);
      return;
    }

    removeCustomProject(projectName);
    toast.success(`"${projectName}" promoted to official project`);
    await loadProjectData();
  }

  if (loading) {
    return <div className="card p-4 text-sm">Loading project master...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Project Master</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Add, rename, archive, and delete projects from one place.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-lg font-semibold">Add Project</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create a new project that will appear in employee assignment lists.</p>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addProject()}
              placeholder="Enter project name"
              className="w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
            />
            <button type="button" className="btn-primary" onClick={addProject}>Add</button>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="text-lg font-semibold">Project Actions</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Rename, archive, or remove existing projects.</p>
          <div className="mt-4 space-y-2">
            {projects.map((project) => (
              <div key={project.id} className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
                {editingProjectId === project.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editingProjectName}
                      onChange={(event) => setEditingProjectName(event.target.value)}
                      className="w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1 text-xs"
                        onClick={() => {
                          setEditingProjectId(null);
                          setEditingProjectName('');
                        }}
                      >
                        Cancel
                      </button>
                      <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => updateProject(project)}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{project.name}</p>
                      <p className="text-xs text-slate-500">{project.is_active ? 'Active' : 'Archived'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1 text-xs"
                        onClick={() => {
                          setEditingProjectId(project.id);
                          setEditingProjectName(project.name);
                        }}
                      >
                        Rename
                      </button>
                      <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => toggleProjectActive(project)}>
                        {project.is_active ? 'Archive' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                        onClick={() => deleteProject(project)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!projects.length ? <p className="text-sm text-slate-500">No projects yet.</p> : null}
          </div>
        </div>

        <div className="card overflow-x-auto p-4 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Project Allocation</h2>
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                <th className="py-2">Project</th>
                <th>Status</th>
                <th>Assigned Employees</th>
              </tr>
            </thead>
            <tbody>
              {projectEmployeeMatrix.map((row) => (
                <tr key={row.project.id} className="border-b border-[#f1f1f1] dark:border-[#444]">
                  <td className="py-2 font-semibold">{row.project.name}</td>
                  <td>{row.project.is_active ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Active</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-700">Archived</span>}</td>
                  <td>{row.employees.length ? row.employees.join(', ') : <span className="text-slate-400">No assignments</span>}</td>
                </tr>
              ))}
              {!projectEmployeeMatrix.length ? <tr><td colSpan={3} className="py-3 text-slate-500">No projects yet.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="card p-4 lg:col-span-2">
          <h2 className="text-lg font-semibold">Unrecognized Projects</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">These projects were entered by employees but do not exist in the official list. Promote them to make them official.</p>
          {unrecognizedProjects.length > 0 ? (
            <div className="mt-4 space-y-2">
              {unrecognizedProjects.map((projectName) => (
                <div key={projectName} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-amber-900/20">
                  <div>
                    <p className="font-semibold text-amber-900 dark:text-amber-100">{projectName}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-200">Used by employees but not official</p>
                  </div>
                  <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => promoteProjectToOfficial(projectName)}>Promote</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">All projects are recognized. ✓</p>
          )}
        </div>
      </div>
    </div>
  );
}
