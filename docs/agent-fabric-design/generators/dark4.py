import sys
sys.path.insert(0,'.')
from dark3 import dark_of
J=[('Spaces-Windows','Spaces-Dark-Windows','Spaces on Windows, dark'),('Work-Windows','Work-Dark-Windows','Work on Windows, dark'),('Computer-Windows','Computer-Dark-Windows','Computer on Windows, dark'),('Search-Windows','Search-Dark-Windows','Search on Windows, dark'),('Shortcuts-Windows','Shortcuts-Dark-Windows','Menu, tray and shortcuts on Windows, dark'),
('Search-Tablet','Search-Dark-Tablet','Search on iPad, dark'),('Notifications-Tablet','Notifications-Dark-Tablet','Notifications on iPad, dark'),('Empty-Tablet','Empty-Dark-Tablet','Nothing here yet on iPad, dark'),
('Offline-Android','Offline-Dark-Android','Offline on Android phone, dark'),('Empty-Android','Empty-Dark-Android','Nothing here yet on Android phone, dark'),('Onboarding-Android','Onboarding-Dark-Android','First run on Android phone, dark'),('Automation-Android','Automation-Dark-Android','New automation on Android phone, dark'),('Design-Android','Design-Dark-Android','Design Studio on Android phone, dark'),('Methods-Android','Methods-Dark-Android','Methods on Android phone, dark')]
if __name__=='__main__':
    for a,b,t in J: dark_of(a+'.dc.html',b+'.dc.html',t)
    print(len(J))
